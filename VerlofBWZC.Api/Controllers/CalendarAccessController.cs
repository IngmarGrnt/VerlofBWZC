using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts.DTO.Access;
using System.Security.Claims;
namespace VerlofBWZC.Api.Controllers;

[ApiController]
[Route("api/access")]
public class CalendarAccessController : ControllerBase
{
    private readonly VerlofBWZC_DbContext _context;
    private readonly CalendarAccessService _svc;
    private readonly UserContext _me;

    public CalendarAccessController(VerlofBWZC_DbContext db, CalendarAccessService svc, UserContext me)
    {
        _context = db;
        _svc = svc;
        _me = me;
    }

    [Authorize]
    [HttpGet("calendar-permissions")]
    public async Task<ActionResult<CalendarPermissionsDTO>> GetMyPermissions([FromQuery] int year, [FromQuery(Name = "team")] string? forTeam = null, [FromQuery(Name = "speciality")] string? forSpeciality = null)
    {
        // Rechten voor een andere ploeg/specialiteit die de gebruiker mag zien (bv. een manager van meerdere ploegen)
        if (!string.IsNullOrWhiteSpace(forTeam) && !string.IsNullOrWhiteSpace(forSpeciality))
        {
            if (!Enum.TryParse<TeamName>(forTeam, true, out var t) || !Enum.TryParse<Speciality>(forSpeciality, true, out var s))
                return BadRequest("Ongeldige ploeg of specialiteit.");
            if (!await _me.CanReadTeamAsync(t, s))
                return Forbid();
            return Ok(await _svc.GetPermissionsAsync(User, t, s, year));
        }

        var teamClaim = User.FindFirst("team")?.Value;
        var specClaim = User.FindFirst("speciality")?.Value;

        TeamName team;
        Speciality speciality;

        // 1) Try claims first (if present)
        if (!string.IsNullOrWhiteSpace(teamClaim) && !string.IsNullOrWhiteSpace(specClaim)
            && Enum.TryParse<TeamName>(teamClaim, true, out var teamFromClaims)
            && Enum.TryParse<Speciality>(specClaim, true, out var specFromClaims))
        {
            team = teamFromClaims;
            speciality = specFromClaims;
        }
        else
        {
            // 2) Fallback: resolve from current user (id from JWT), then DB
            var userIdClaim =
                User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                ?? User.FindFirst("sub")?.Value
                ?? User.FindFirst("userId")?.Value;

            if (!int.TryParse(userIdClaim, out var personId))
                return Forbid();

            // Assumes you have a Person entity with Team and Speciality enums
            var person = await _context.Set<Person>()
                .AsNoTracking()
                .Where(p => p.Id == personId)
                .Select(p => new { p.Team, p.Speciality })
                .FirstOrDefaultAsync();

            if (person == null)
                return Forbid();

            // Zonder team of specialiteit gelden geen teamregels (admins krijgen alles via de service)
            if (person.Team == null || person.Speciality == null)
                return Ok(User.IsAdmin()
                    ? new CalendarPermissionsDTO(true, true, true)
                    : new CalendarPermissionsDTO(false, false, false));

            team = person.Team.Value;
            speciality = person.Speciality.Value;
        }

        var dto = await _svc.GetPermissionsAsync(User, team, speciality, year);
        return Ok(dto);
    }

    // Manager panel CRUD (DTO-based)
    [HttpGet("calendar-rules")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<IEnumerable<CalendarAccessRuleDTO>>> List([FromQuery] string? team, [FromQuery] string? speciality)
    {
        var q = _context.Set<CalendarAccessRule>().AsQueryable();

        // Manager: enkel de regels van de ploegen en specialiteiten die hij beheert
        if (!_me.IsAdmin)
        {
            var keys = await _me.GetScopeKeysAsync();
            q = q.Where(r => keys.Contains((int)r.Team * 100 + (int)r.Speciality));
        }

        if (!string.IsNullOrWhiteSpace(team))
        {
            if (!Enum.TryParse<TeamName>(team, true, out var teamEnum))
                return BadRequest("Invalid team.");
            q = q.Where(r => r.Team == teamEnum);
        }

        if (!string.IsNullOrWhiteSpace(speciality))
        {
            if (!Enum.TryParse<Speciality>(speciality, true, out var specEnum))
                return BadRequest("Invalid speciality.");
            q = q.Where(r => r.Speciality == specEnum);
        }

        var items = await q
            .OrderBy(r => r.Team).ThenBy(r => r.Speciality).ThenBy(r => r.Year)
            .AsNoTracking()
            .ToListAsync();

        var dtos = items.Select(MapToDto).ToList();
        return Ok(dtos);
    }

    [HttpPost("calendar-rules")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<CalendarAccessRuleDTO>> Create(CalendarAccessRuleDTO dto)
    {
        if (!TryParseEnums(dto.Team, dto.Speciality, out var team, out var spec, out var error))
            return BadRequest(error);
        if (!await _me.CanManageTeamAsync(team, spec))
            return Forbid();

        var entity = new CalendarAccessRule
        {
            Team = team,
            Speciality = spec,
            Year = dto.Year,
            CanSeeTeamCalendar = dto.CanSeeTeamCalendar,
            CanSaveWorkCalendar = dto.CanSaveWorkCalendar,
            CanSaveTeamCalendar = dto.CanSaveTeamCalendar,
            CanSeeAllTeams = dto.CanSeeAllTeams
        };

        _context.Add(entity);
        await _context.SaveChangesAsync();

        var created = MapToDto(entity);
        return CreatedAtAction(nameof(GetById), new { id = entity.Id }, created);
    }

    [HttpGet("calendar-rules/{id:int}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<ActionResult<CalendarAccessRuleDTO>> GetById(int id)
    {
        var item = await _context.Set<CalendarAccessRule>().FindAsync(id);
        if (item != null && !await _me.CanManageTeamAsync(item.Team, item.Speciality))
            return Forbid();
        return item == null ? NotFound() : Ok(MapToDto(item));
        }

    [HttpPut("calendar-rules/{id:int}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Update(int id, CalendarAccessRuleDTO dto)
    {
        if (id != dto.Id) return BadRequest();

        var entity = await _context.Set<CalendarAccessRule>().FindAsync(id);
        if (entity == null) return NotFound();

        if (!TryParseEnums(dto.Team, dto.Speciality, out var team, out var spec, out var error))
            return BadRequest(error);
        if (!await _me.CanManageTeamAsync(entity.Team, entity.Speciality) || !await _me.CanManageTeamAsync(team, spec))
            return Forbid();

        entity.Team = team;
        entity.Speciality = spec;
        entity.Year = dto.Year;
        entity.CanSeeTeamCalendar = dto.CanSeeTeamCalendar;
        entity.CanSaveWorkCalendar = dto.CanSaveWorkCalendar;
        entity.CanSaveTeamCalendar = dto.CanSaveTeamCalendar;
        entity.CanSeeAllTeams = dto.CanSeeAllTeams;

        await _context.SaveChangesAsync();
        return NoContent();
    }

    [HttpDelete("calendar-rules/{id:int}")]
    [Authorize(Roles = "Admin,Manager")]
    public async Task<IActionResult> Delete(int id)
    {
        var item = await _context.Set<CalendarAccessRule>().FindAsync(id);
        if (item == null) return NotFound();
        if (!await _me.CanManageTeamAsync(item.Team, item.Speciality))
            return Forbid();
        _context.Remove(item);
        await _context.SaveChangesAsync();
        return NoContent();
    }

    private static CalendarAccessRuleDTO MapToDto(CalendarAccessRule e) => new()
    {
        Id = e.Id,
        Team = e.Team.ToString(),
        Speciality = e.Speciality.ToString(),
        Year = e.Year,
        CanSeeTeamCalendar = e.CanSeeTeamCalendar,
        CanSaveWorkCalendar = e.CanSaveWorkCalendar,
        CanSaveTeamCalendar = e.CanSaveTeamCalendar,
        CanSeeAllTeams = e.CanSeeAllTeams
    };

    private static bool TryParseEnums(string team, string speciality, out TeamName teamEnum, out Speciality specEnum, out string? error)
    {
        error = null;
        if (!Enum.TryParse<TeamName>(team, true, out teamEnum))
        {
            error = "Invalid team value.";
            specEnum = default;
            return false;
        }
        if (!Enum.TryParse<Speciality>(speciality, true, out specEnum))
        {
            error = "Invalid speciality value.";
            return false;
        }
        return true;
    }
}
