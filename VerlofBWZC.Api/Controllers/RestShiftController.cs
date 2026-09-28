using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts;
using VerlofBWZC.DataContracts.DTO.Calendar;

namespace VerlofBWZC.Api.Controllers
{
    // Rust voor de ploeg zonder werkregime (Ploeg0, zie Werkregels.AllowsRestShifts):
    // een shift waarop iemand niet werkt. Geen verlof; hij is dan niet aanwezig.
    [ApiController]
    [Route("api/rest-shifts")]
    [Authorize]
    public class RestShiftController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _context;
        private readonly UserContext _me;
        private readonly CalendarAccessService _access;

        public RestShiftController(VerlofBWZC_DbContext context, UserContext me, CalendarAccessService access)
        {
            _context = context;
            _me = me;
            _access = access;
        }

        // Rust van de personen van een ploeg (en eventueel specialiteit) in een jaar
        [HttpGet]
        public async Task<ActionResult<IEnumerable<RestShiftDTO>>> GetForTeam([FromQuery] string team, [FromQuery] int year, [FromQuery] string? speciality = null)
        {
            if (!Enum.TryParse<TeamName>(team, true, out var teamEnum))
                return BadRequest("Ongeldige ploeg.");
            Speciality? specEnum = null;
            if (!string.IsNullOrEmpty(speciality))
            {
                if (!Enum.TryParse<Speciality>(speciality, true, out var s))
                    return BadRequest("Ongeldige specialiteit.");
                specEnum = s;
            }
            if (!await _me.CanReadTeamAsync(teamEnum, specEnum))
                return Forbid();

            var items = await (
                from r in _context.RestShifts.AsNoTracking()
                join p in _context.Persons.AsNoTracking() on r.PersonId equals p.Id
                where !p.IsDeleted && p.Team == teamEnum && (specEnum == null || p.Speciality == specEnum) && r.Date.Year == year
                orderby r.Date, r.Shift
                select r).ToListAsync();
            return Ok(items.Select(MapToDto));
        }

        // Eigen rust (werkkalender)
        [HttpGet("mine")]
        public async Task<ActionResult<IEnumerable<RestShiftDTO>>> GetMine([FromQuery] int year)
        {
            if (_me.Id is not int id)
                return Unauthorized();

            var items = await _context.RestShifts.AsNoTracking()
                .Where(r => r.PersonId == id && r.Date.Year == year)
                .OrderBy(r => r.Date).ThenBy(r => r.Shift)
                .ToListAsync();
            return Ok(items.Select(MapToDto));
        }

        // Teamkalender opslaan: de rust van deze personen in dit jaar vervangen
        [HttpPost("save")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Save(SaveRestShiftsRequest request)
        {
            var ids = request.Persons.Select(p => p.PersonId).Distinct().ToList();
            var persons = await _context.Persons.AsNoTracking()
                .Where(p => ids.Contains(p.Id) && !p.IsDeleted)
                .ToDictionaryAsync(p => p.Id);
            if (persons.Count != ids.Count)
                return BadRequest("Persoon niet gevonden.");

            foreach (var person in persons.Values)
            {
                if (!Werkregels.AllowsRestShifts(person.Team?.ToString()))
                    return BadRequest($"Rust aanduiden kan enkel voor {Werkregels.NoRegimeTeam} ({person.FirstName} {person.LastName}).");
                if (!await _me.CanManageTeamAsync(person.Team, person.Speciality))
                    return Forbid();
                if (!_me.IsAdmin)
                {
                    var perms = await _access.GetPermissionsAsync(User, person.Team!.Value, person.Speciality!.Value, request.Year);
                    if (!perms.CanSaveTeamCalendar)
                        return Forbid();
                }
            }

            var days = request.Persons
                .SelectMany(p => p.Days.Select(d => (p.PersonId, Date: d.Date.Date, d.Shift)))
                .Distinct()
                .ToList();
            if (days.Any(d => d.Shift is not ("D" or "N") || d.Date.Year != request.Year))
                return BadRequest($"Ongeldige shift of datum buiten {request.Year}.");

            // Rust en verlof op dezelfde shift kan niet
            var leave = await _context.DayOffs.AsNoTracking()
                .Where(d => ids.Contains(d.PersonId) && d.Date.Year == request.Year)
                .Select(d => new { d.PersonId, d.Date, d.Shift })
                .ToListAsync();
            var conflict = days.FirstOrDefault(r => leave.Any(l => l.PersonId == r.PersonId && l.Date.Date == r.Date && l.Shift == r.Shift));
            if (conflict != default)
            {
                var p = persons[conflict.PersonId];
                return BadRequest($"{p.FirstName} {p.LastName} heeft verlof op {conflict.Date:dd/MM/yyyy} {conflict.Shift}: rust en verlof samen kan niet.");
            }

            var existing = await _context.RestShifts
                .Where(r => ids.Contains(r.PersonId) && r.Date.Year == request.Year)
                .ToListAsync();
            _context.RestShifts.RemoveRange(existing);
            _context.RestShifts.AddRange(days.Select(d => new RestShift
            {
                PersonId = d.PersonId,
                Date = d.Date,
                Shift = d.Shift,
                LastUpdate = DateTime.Now
            }));
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static RestShiftDTO MapToDto(RestShift r) => new()
        {
            PersonId = r.PersonId,
            Date = r.Date,
            Shift = r.Shift
        };
    }
}
