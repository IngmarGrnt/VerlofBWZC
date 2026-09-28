using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts.DTO.Leave;

namespace VerlofBWZC.Api.Controllers
{
    // Maximum aantal personen met verlof per shift (quota), per ploeg en specialiteit
    [ApiController]
    [Route("api/shift-quotas")]
    public class ShiftQuotaController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _context;
        private readonly UserContext _me;

        public ShiftQuotaController(VerlofBWZC_DbContext context, UserContext me)
        {
            _context = context;
            _me = me;
        }

        // Geldende regels van een ploeg voor een jaar (per specialiteit: jaarregel gaat voor op de standaard).
        // Specialiteiten zonder regel ontbreken: daar geldt de standaard (kwart van de personen).
        [HttpGet]
        public async Task<ActionResult<IEnumerable<ShiftQuotaDTO>>> GetForTeam([FromQuery] string team, [FromQuery] int year)
        {
            if (!Enum.TryParse<TeamName>(team, true, out var teamEnum))
                return BadRequest("Ongeldige ploeg.");

            var candidates = await _context.ShiftQuotas.AsNoTracking()
                .Where(q => q.Team == teamEnum && (q.Year == year || q.Year == null))
                .ToListAsync();

            var result = new List<ShiftQuotaDTO>();
            foreach (var group in candidates.GroupBy(q => q.Speciality))
            {
                if (!await _me.CanReadTeamAsync(teamEnum, group.Key))
                    continue;
                var rule = group.FirstOrDefault(q => q.Year == year) ?? group.First(q => q.Year == null);
                result.Add(MapToDto(rule));
            }
            return Ok(result);
        }

        // Beheer: Admin alles, Manager de ploegen en specialiteiten die hij beheert
        [HttpGet("rules")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<ShiftQuotaDTO>>> ListRules()
        {
            var query = _context.ShiftQuotas.AsNoTracking();
            if (!_me.IsAdmin)
            {
                var keys = await _me.GetScopeKeysAsync();
                query = query.Where(q => keys.Contains((int)q.Team * 100 + (int)q.Speciality));
            }

            var items = await query
                .OrderBy(q => q.Team).ThenBy(q => q.Speciality).ThenBy(q => q.Year)
                .ToListAsync();
            return Ok(items.Select(MapToDto));
        }

        [HttpPost("rules")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<ShiftQuotaDTO>> Create(ShiftQuotaDTO dto)
        {
            var entity = new ShiftQuota();
            var error = Apply(dto, entity);
            if (error != null)
                return BadRequest(error);
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            // Eén regel per ploeg + specialiteit + jaar
            if (await _context.ShiftQuotas.AnyAsync(q => q.Team == entity.Team && q.Speciality == entity.Speciality && q.Year == entity.Year))
                return BadRequest($"Er bestaat al een quotaregel voor {entity.Team}/{entity.Speciality} ({entity.Year?.ToString() ?? "alle jaren"}).");

            _context.ShiftQuotas.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(MapToDto(entity));
        }

        [HttpPut("rules/{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Update(int id, ShiftQuotaDTO dto)
        {
            if (id != dto.Id)
                return BadRequest();

            var entity = await _context.ShiftQuotas.FindAsync(id);
            if (entity == null)
                return NotFound();
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            var error = Apply(dto, entity);
            if (error != null)
                return BadRequest(error);
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            if (await _context.ShiftQuotas.AnyAsync(q => q.Id != id && q.Team == entity.Team && q.Speciality == entity.Speciality && q.Year == entity.Year))
                return BadRequest($"Er bestaat al een quotaregel voor {entity.Team}/{entity.Speciality} ({entity.Year?.ToString() ?? "alle jaren"}).");

            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete("rules/{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.ShiftQuotas.FindAsync(id);
            if (entity == null)
                return NotFound();
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            _context.ShiftQuotas.Remove(entity);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static string? Apply(ShiftQuotaDTO dto, ShiftQuota entity)
        {
            if (!Enum.TryParse<TeamName>(dto.Team, true, out var team))
                return "Ongeldige ploeg.";
            if (!Enum.TryParse<Speciality>(dto.Speciality, true, out var spec))
                return "Ongeldige specialiteit.";
            if (dto.DayMax < 0 || dto.DayMax > 100 || dto.NightMax < 0 || dto.NightMax > 100)
                return "Het maximum per shift moet tussen 0 en 100 liggen.";

            entity.Team = team;
            entity.Speciality = spec;
            entity.Year = dto.Year;
            entity.DayMax = dto.DayMax;
            entity.NightMax = dto.NightMax;
            entity.LastUpdate = DateTime.Now;
            return null;
        }

        private static ShiftQuotaDTO MapToDto(ShiftQuota q) => new()
        {
            Id = q.Id,
            Team = q.Team.ToString(),
            Speciality = q.Speciality.ToString(),
            Year = q.Year,
            DayMax = q.DayMax,
            NightMax = q.NightMax
        };
    }
}
