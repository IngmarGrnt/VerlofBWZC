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
    [ApiController]
    [Route("api/quarter-limits")]
    public class QuarterLimitController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _context;
        private readonly UserContext _me;

        public QuarterLimitController(VerlofBWZC_DbContext context, UserContext me)
        {
            _context = context;
            _me = me;
        }

        // Kwartaalmaxima voor de ingelogde gebruiker (werkkalender); standaard 14/16/14 als niets is ingesteld
        [HttpGet("mine")]
        public async Task<ActionResult<QuarterLimitDTO>> GetMine([FromQuery] int year)
        {
            var me = await _me.GetTeamAsync();

            if (me.Team == null || me.Speciality == null)
                return Ok(new QuarterLimitDTO { IsDefault = true, Year = year });

            var candidates = await _context.QuarterLimits.AsNoTracking()
                .Where(q => q.Team == me.Team && q.Speciality == me.Speciality && (q.Year == year || q.Year == null))
                .ToListAsync();

            // Regel voor het specifieke jaar gaat voor op de standaardregel
            var rule = candidates.FirstOrDefault(q => q.Year == year) ?? candidates.FirstOrDefault(q => q.Year == null);
            if (rule == null)
                return Ok(new QuarterLimitDTO { Team = me.Team.Value.ToString(), Speciality = me.Speciality.Value.ToString(), Year = year, IsDefault = true });

            return Ok(MapToDto(rule));
        }

        // Beheer (Verlofregels-pagina)
        [HttpGet("rules")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<QuarterLimitDTO>>> ListRules()
        {
            var query = _context.QuarterLimits.AsNoTracking();
            if (!_me.IsAdmin)
            {
                var own = await _me.GetTeamAsync();
                query = query.Where(q => q.Team == own.Team && q.Speciality == own.Speciality);
            }

            var items = await query
                .OrderBy(q => q.Team).ThenBy(q => q.Speciality).ThenBy(q => q.Year)
                .ToListAsync();
            return Ok(items.Select(MapToDto));
        }

        [HttpPost("rules")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<QuarterLimitDTO>> Create(QuarterLimitDTO dto)
        {
            var entity = new QuarterLimit();
            var error = Apply(dto, entity);
            if (error != null)
                return BadRequest(error);
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            // Eén regel per ploeg + specialiteit + jaar
            var exists = await _context.QuarterLimits.AnyAsync(q => q.Team == entity.Team && q.Speciality == entity.Speciality && q.Year == entity.Year);
            if (exists)
                return BadRequest($"Er bestaat al een kwartaalregel voor {entity.Team}/{entity.Speciality} ({entity.Year?.ToString() ?? "alle jaren"}).");

            _context.QuarterLimits.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(MapToDto(entity));
        }

        [HttpPut("rules/{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Update(int id, QuarterLimitDTO dto)
        {
            if (id != dto.Id)
                return BadRequest();

            var entity = await _context.QuarterLimits.FindAsync(id);
            if (entity == null)
                return NotFound();
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            var error = Apply(dto, entity);
            if (error != null)
                return BadRequest(error);
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            var duplicate = await _context.QuarterLimits.AnyAsync(q => q.Id != id && q.Team == entity.Team && q.Speciality == entity.Speciality && q.Year == entity.Year);
            if (duplicate)
                return BadRequest($"Er bestaat al een kwartaalregel voor {entity.Team}/{entity.Speciality} ({entity.Year?.ToString() ?? "alle jaren"}).");

            await _context.SaveChangesAsync();
            return NoContent();
        }

        [HttpDelete("rules/{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.QuarterLimits.FindAsync(id);
            if (entity == null)
                return NotFound();
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            _context.QuarterLimits.Remove(entity);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static string? Apply(QuarterLimitDTO dto, QuarterLimit entity)
        {
            if (!Enum.TryParse<TeamName>(dto.Team, true, out var team))
                return "Ongeldige ploeg.";
            if (!Enum.TryParse<Speciality>(dto.Speciality, true, out var spec))
                return "Ongeldige specialiteit.";
            if (new[] { dto.Q1Max, dto.Q2Max, dto.Q3Max }.Any(v => v < 0 || v > 250))
                return "Kwartaalmaxima moeten tussen 0 en 250 liggen.";

            entity.Team = team;
            entity.Speciality = spec;
            entity.Year = dto.Year;
            entity.Q1Max = dto.Q1Max;
            entity.Q2Max = dto.Q2Max;
            entity.Q3Max = dto.Q3Max;
            entity.LastUpdate = DateTime.Now;
            return null;
        }

        private static QuarterLimitDTO MapToDto(QuarterLimit q) => new()
        {
            Id = q.Id,
            Team = q.Team.ToString(),
            Speciality = q.Speciality.ToString(),
            Year = q.Year,
            Q1Max = q.Q1Max,
            Q2Max = q.Q2Max,
            Q3Max = q.Q3Max
        };
    }
}
