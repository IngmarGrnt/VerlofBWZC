using System.Text.RegularExpressions;
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
    [Route("api/leave-categories")]
    public class LeaveCategoryController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _context;
        private readonly LeaveCategoryService _svc;
        private readonly UserContext _me;

        public LeaveCategoryController(VerlofBWZC_DbContext context, LeaveCategoryService svc, UserContext me)
        {
            _context = context;
            _svc = svc;
            _me = me;
        }

        // Categorieën die gelden voor de ingelogde gebruiker (werkkalender)
        [HttpGet("mine")]
        public async Task<ActionResult<IEnumerable<LeaveCategoryDTO>>> GetMine([FromQuery] int year)
        {
            var own = await _me.GetTeamAsync();
            if (own.Team == null || own.Speciality == null)
                return Ok(Array.Empty<LeaveCategoryDTO>());

            var items = await _svc.GetApplicableAsync(own.Team.Value, own.Speciality.Value, year);
            return Ok(items.Select(MapToDto));
        }

        // Toepasselijke categorieën van een ploeg (en optioneel specialiteit), voor de teamkalender
        [HttpGet]
        public async Task<ActionResult<IEnumerable<LeaveCategoryDTO>>> GetForTeam([FromQuery] string team, [FromQuery] string? speciality, [FromQuery] int year)
        {
            if (!Enum.TryParse<TeamName>(team, true, out var teamEnum))
                return BadRequest("Ongeldige ploeg.");

            Speciality? specEnum = null;
            if (!string.IsNullOrWhiteSpace(speciality))
            {
                if (!Enum.TryParse<Speciality>(speciality, true, out var parsed))
                    return BadRequest("Ongeldige specialiteit.");
                specEnum = parsed;
            }

            if (!await _me.CanReadTeamAsync(teamEnum, specEnum))
                return Forbid();

            var items = specEnum == null
                ? await _svc.GetApplicableForTeamAsync(teamEnum, year)
                : await _svc.GetApplicableAsync(teamEnum, specEnum.Value, year);
            return Ok(items.Select(MapToDto));
        }

        // Beheer (Verlofregels-pagina): Admin alles, Manager enkel eigen ploeg en specialiteit
        [HttpGet("rules")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<LeaveCategoryDTO>>> ListRules()
        {
            var query = _context.LeaveCategories.AsNoTracking();
            if (!_me.IsAdmin)
            {
                var own = await _me.GetTeamAsync();
                query = query.Where(c => c.Team == own.Team && c.Speciality == own.Speciality);
            }

            var items = await query
                .OrderBy(c => c.Team).ThenBy(c => c.Speciality).ThenBy(c => c.Year).ThenBy(c => c.SortOrder)
                .ToListAsync();
            return Ok(items.Select(MapToDto));
        }

        [HttpPost("rules")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<LeaveCategoryDTO>> Create(LeaveCategoryDTO dto)
        {
            var entity = new LeaveCategory();
            var error = Apply(dto, entity);
            if (error != null)
                return BadRequest(error);
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            _context.LeaveCategories.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(MapToDto(entity));
        }

        [HttpPut("rules/{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Update(int id, LeaveCategoryDTO dto)
        {
            if (id != dto.Id)
                return BadRequest();

            var entity = await _context.LeaveCategories.FindAsync(id);
            if (entity == null)
                return NotFound();
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            var error = Apply(dto, entity);
            if (error != null)
                return BadRequest(error);
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Verwijderen maakt de gekoppelde verlofshiften weer gewoon verlof (FK SetNull)
        [HttpDelete("rules/{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.LeaveCategories.FindAsync(id);
            if (entity == null)
                return NotFound();
            if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality))
                return Forbid();

            _context.LeaveCategories.Remove(entity);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static string? Apply(LeaveCategoryDTO dto, LeaveCategory entity)
        {
            if (!Enum.TryParse<TeamName>(dto.Team, true, out var team))
                return "Ongeldige ploeg.";
            if (!Enum.TryParse<Speciality>(dto.Speciality, true, out var spec))
                return "Ongeldige specialiteit.";
            if (string.IsNullOrWhiteSpace(dto.Name) || dto.Name.Trim().Length > 50)
                return "Naam is verplicht (max 50 tekens).";
            if (dto.MaxShifts < 0 || dto.MaxShifts > 366)
                return "Maximum aantal shiften moet tussen 0 en 366 liggen.";
            if (!Regex.IsMatch(dto.Color ?? "", "^#[0-9A-Fa-f]{6}$"))
                return "Kleur moet een hexcode zijn, bv. #E8590C.";

            entity.Team = team;
            entity.Speciality = spec;
            entity.Year = dto.Year;
            entity.Name = dto.Name.Trim();
            entity.MaxShifts = dto.MaxShifts;
            entity.Color = dto.Color!.ToUpperInvariant();
            entity.SortOrder = dto.SortOrder;
            entity.LastUpdate = DateTime.Now;
            return null;
        }

        private static LeaveCategoryDTO MapToDto(LeaveCategory c) => new()
        {
            Id = c.Id,
            Team = c.Team.ToString(),
            Speciality = c.Speciality.ToString(),
            Year = c.Year,
            Name = c.Name,
            MaxShifts = c.MaxShifts,
            Color = c.Color,
            SortOrder = c.SortOrder
        };
    }
}
