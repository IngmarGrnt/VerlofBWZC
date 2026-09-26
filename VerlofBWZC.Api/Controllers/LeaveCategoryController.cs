using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
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

        public LeaveCategoryController(VerlofBWZC_DbContext context, LeaveCategoryService svc)
        {
            _context = context;
            _svc = svc;
        }

        // Categorieën die gelden voor de ingelogde gebruiker (werkkalender)
        [HttpGet("mine")]
        public async Task<ActionResult<IEnumerable<LeaveCategoryDTO>>> GetMine([FromQuery] int year)
        {
            var userId = User.GetUserId();
            var me = await _context.Persons.AsNoTracking()
                .Where(p => p.Id == userId)
                .Select(p => new { p.Team, p.Speciality })
                .FirstOrDefaultAsync();

            if (me?.Team == null || me.Speciality == null)
                return Ok(Array.Empty<LeaveCategoryDTO>());

            var items = await _svc.GetApplicableAsync(me.Team.Value, me.Speciality.Value, year);
            return Ok(items.Select(MapToDto));
        }

        // Toepasselijke categorieën van een ploeg (en optioneel specialiteit), voor de teamkalender
        [HttpGet]
        public async Task<ActionResult<IEnumerable<LeaveCategoryDTO>>> GetForTeam([FromQuery] string team, [FromQuery] string? speciality, [FromQuery] int year)
        {
            if (!Enum.TryParse<TeamName>(team, true, out var teamEnum))
                return BadRequest("Ongeldige ploeg.");

            if (!await CanReadTeamAsync(teamEnum))
                return Forbid();

            if (string.IsNullOrWhiteSpace(speciality))
                return Ok((await _svc.GetApplicableForTeamAsync(teamEnum, year)).Select(MapToDto));

            if (!Enum.TryParse<Speciality>(speciality, true, out var specEnum))
                return BadRequest("Ongeldige specialiteit.");

            return Ok((await _svc.GetApplicableAsync(teamEnum, specEnum, year)).Select(MapToDto));
        }

        // Beheer (Verlofregels-pagina)
        [HttpGet("rules")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<LeaveCategoryDTO>>> ListRules()
        {
            var items = await _context.LeaveCategories.AsNoTracking()
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

            var error = Apply(dto, entity);
            if (error != null)
                return BadRequest(error);

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
                return "Kleur moet een hexcode zijn, bv. #E53935.";

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

        private async Task<bool> CanReadTeamAsync(TeamName team)
        {
            if (User.IsAdminOrManager())
                return true;

            var userId = User.GetUserId();
            var ownTeam = await _context.Persons.Where(p => p.Id == userId).Select(p => p.Team).FirstOrDefaultAsync();
            return ownTeam == team;
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
