using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts;
using VerlofBWZC.DataContracts.DTO.Calendar;

namespace VerlofBWZC.Api.Controllers
{
    // Extra shift: iemand werkt een dag- of nachtshift in een andere ploeg (enkel Dispatching, zie Werkregels).
    // Geen verlof: telt niet mee in het verlofaantal, de kwartaalmaxima of de loting.
    [ApiController]
    [Route("api/extra-shifts")]
    [Authorize]
    public class ExtraShiftController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _context;
        private readonly UserContext _me;
        private readonly CalendarAccessService _access;
        private readonly CalendarHelper _calendar;

        public ExtraShiftController(VerlofBWZC_DbContext context, UserContext me, CalendarAccessService access, CalendarHelper calendar)
        {
            _context = context;
            _me = me;
            _access = access;
            _calendar = calendar;
        }

        // Extra shiften die in een ploeg gewerkt worden (door personen van een specialiteit die de gebruiker mag zien)
        [HttpGet]
        public async Task<ActionResult<IEnumerable<ExtraShiftDTO>>> GetForTeam([FromQuery] string team, [FromQuery] int year, [FromQuery] string? speciality = null)
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

            var items = await Query()
                .Where(x => x.Shift.Team == teamEnum && x.Shift.Date.Year == year)
                .Where(x => specEnum == null || x.Person.Speciality == specEnum)
                .ToListAsync();
            return Ok(items.Select(x => MapToDto(x.Shift, x.Person)));
        }

        // Eigen extra shiften (werkkalender)
        [HttpGet("mine")]
        public async Task<ActionResult<IEnumerable<ExtraShiftDTO>>> GetMine([FromQuery] int year)
        {
            if (_me.Id is not int id)
                return Unauthorized();

            var items = await Query()
                .Where(x => x.Shift.PersonId == id && x.Shift.Date.Year == year)
                .ToListAsync();
            return Ok(items.Select(x => MapToDto(x.Shift, x.Person)));
        }

        [HttpPost]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<ExtraShiftDTO>> Create(ExtraShiftDTO dto)
        {
            var person = await _context.Persons.AsNoTracking().FirstOrDefaultAsync(p => p.Id == dto.PersonId && !p.IsDeleted);
            if (person == null)
                return BadRequest("Persoon niet gevonden.");
            if (person.Team == null || person.Speciality == null)
                return BadRequest("Deze persoon heeft geen ploeg of specialiteit.");
            if (!Werkregels.AllowsExtraShifts(person.Speciality.ToString()))
                return BadRequest($"Een extra shift kan enkel voor {Werkregels.AllTeamsSpeciality}.");
            if (dto.Shift is not ("D" or "N"))
                return BadRequest("Kies een dagshift (D) of nachtshift (N).");
            if (!Enum.TryParse<TeamName>(dto.Team, true, out var team))
                return BadRequest("Ongeldige ploeg.");
            if (team == person.Team)
                return BadRequest("Een extra shift is in een andere ploeg dan de eigen ploeg.");

            var date = dto.Date.Date;
            var shiftText = dto.Shift == "D" ? "dagshift" : "nachtshift";
            if (!Works(team, date, dto.Shift))
                return BadRequest($"{team} werkt geen {shiftText} op {date:dd/MM/yyyy}.");
            if (Works(person.Team.Value, date, dto.Shift) && !Werkregels.ExtraShiftAllowedOnOwnShift(person.Team.ToString()))
                return BadRequest($"{person.FirstName} {person.LastName} werkt die {shiftText} al in {person.Team}.");

            // Beheren: de ploeg waar hij bijspringt en zijn eigen ploeg, en opslaan mag volgens het Manager Paneel
            if (!await _me.CanManageTeamAsync(team, person.Speciality) || !await _me.CanManageTeamAsync(person.Team, person.Speciality))
                return Forbid();
            if (!_me.IsAdmin)
            {
                var perms = await _access.GetPermissionsAsync(User, team, person.Speciality.Value, date.Year);
                if (!perms.CanSaveTeamCalendar)
                    return Forbid();
            }

            if (await _context.ExtraShifts.AnyAsync(e => e.PersonId == person.Id && e.Date == date && e.Shift == dto.Shift))
                return BadRequest($"{person.FirstName} {person.LastName} heeft op die {shiftText} al een extra shift.");

            var entity = new ExtraShift
            {
                PersonId = person.Id,
                Date = date,
                Shift = dto.Shift,
                Team = team,
                Note = CleanNote(dto.Note),
                LastUpdate = DateTime.Now
            };
            _context.ExtraShifts.Add(entity);
            await _context.SaveChangesAsync();
            return Ok(MapToDto(entity, person));
        }

        [HttpDelete("{id:int}")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Delete(int id)
        {
            var entity = await _context.ExtraShifts.FindAsync(id);
            if (entity == null)
                return NotFound();

            var person = await _context.Persons.AsNoTracking().FirstOrDefaultAsync(p => p.Id == entity.PersonId);
            if (!await _me.CanManageTeamAsync(entity.Team, person?.Speciality))
                return Forbid();
            if (!_me.IsAdmin && person?.Speciality != null)
            {
                var perms = await _access.GetPermissionsAsync(User, entity.Team, person.Speciality.Value, entity.Date.Year);
                if (!perms.CanSaveTeamCalendar)
                    return Forbid();
            }

            _context.ExtraShifts.Remove(entity);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private static string? CleanNote(string? note)
        {
            var text = note?.Trim();
            if (string.IsNullOrEmpty(text))
                return null;
            return text.Length > 200 ? text[..200] : text;
        }

        private bool Works(TeamName team, DateTime date, string shift) =>
            _calendar.GenerateWorkCalendar(new Team { Name = team }, date.Year)
                .Any(w => w.Date.Date == date && w.Shift == shift);

        private IQueryable<ShiftWithPerson> Query() =>
            from e in _context.ExtraShifts.AsNoTracking()
            join p in _context.Persons.AsNoTracking() on e.PersonId equals p.Id
            where !p.IsDeleted
            orderby e.Date, e.Shift
            select new ShiftWithPerson { Shift = e, Person = p };

        private class ShiftWithPerson
        {
            public ExtraShift Shift { get; set; } = null!;
            public Person Person { get; set; } = null!;
        }

        private static ExtraShiftDTO MapToDto(ExtraShift e, Person p) => new()
        {
            Id = e.Id,
            PersonId = e.PersonId,
            Date = e.Date,
            Shift = e.Shift,
            Team = e.Team.ToString(),
            Note = e.Note,
            FirstName = p.FirstName,
            LastName = p.LastName,
            Initials = string.IsNullOrWhiteSpace(p.Initials) ? PersonInitials.FromLastName(p.LastName) : p.Initials,
            PersonTeam = p.Team?.ToString(),
            PersonSpeciality = p.Speciality?.ToString()
        };
    }
}
