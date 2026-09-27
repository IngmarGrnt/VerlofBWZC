using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts.DTO.Access;
using VerlofBWZC.DataContracts.DTO.Calendar;

namespace VerlofBWZC.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CalenderController : ControllerBase
    {
        private readonly VerlofBWZC_DbContext _context;
        private readonly CalendarHelper _calendarService;
        private readonly CalendarAccessService _access;
        private readonly LeaveCategoryService _leaveCategories;
        private readonly UserContext _me;

        // DTO voor de request body
        public class AddDayOffRequest
        {
            public int PersonId { get; set; }
            public DateTime Date { get; set; }
            public string? Description { get; set; }
            public DayOffstatus? Status { get; set; }
        }

        public CalenderController(VerlofBWZC_DbContext context, CalendarHelper calendarService, CalendarAccessService access, LeaveCategoryService leaveCategories, UserContext me)
        {
            _context = context;
            _calendarService = calendarService;
            _access = access;
            _leaveCategories = leaveCategories;
            _me = me;
        }

        [HttpGet]
        public IActionResult GetCalendar(TeamName teamName, int year)
        {
            // Maak een Team-object aan op basis van de enum
            var team = new Team { Name = teamName };
            var calendar = _calendarService.GenerateWorkCalendar(team, year);
            return Ok(calendar);
        }

        [HttpPost("add-dayoff")]
        public async Task<IActionResult> AddMultipleDayOffs([FromBody] AddMultipleDayOffsRequest request)
        {
            if (!await CanAccessPersonAsync(request.PersoonId))
                return Forbid();

            // Controleer of de persoon bestaat
            var person = await _context.Persons.FindAsync(request.PersoonId);
            if (person == null)
            {
                return NotFound($"Persoon met id {request.PersoonId} niet gevonden.");
            }

            // Haal alle bestaande DayOffs voor deze persoon op
            var existingDayOffs = await _context.DayOffs
                .Where(d => d.PersonId == request.PersoonId)
                .ToListAsync();

            // Bepaal de datums die in de request zitten
            var requestedDates = request.Days.Select(d => d.Date.Date).ToHashSet();

            
            // Alleen verwijderen als het jaar toegestaan is
            var currentYear = DateTime.Now.Year;
            var allowedYears = new[] {currentYear + 1 };
            var toRemove = existingDayOffs
                .Where(d => !requestedDates.Contains(d.Date.Date) && allowedYears.Contains(d.Date.Year))
                .ToList();
            if (toRemove.Any())
            {
                _context.DayOffs.RemoveRange(toRemove);
            }


            var addedDates = new List<DateTime>();
            var skippedDates = new List<DateTime>();
            var recategorizedDates = new List<DateTime>();
            var newDayOffs = new List<DayOff>();

            // Voeg nieuwe DayOffs toe die nog niet bestaan
            foreach (var day in request.Days)
            {
                var existing = existingDayOffs.FirstOrDefault(d => d.Date.Date == day.Date.Date);
                if (existing != null)
                {
                    // Bestaande verlofshift: enkel de categorie kan wijzigen
                    if (existing.LeaveCategoryId != day.LeaveCategoryId)
                    {
                        existing.LeaveCategoryId = day.LeaveCategoryId;
                        existing.LastUpdate = DateTime.Now;
                        recategorizedDates.Add(day.Date);
                    }
                    else
                    {
                        skippedDates.Add(day.Date);
                    }
                    continue;
                }

                var dayOff = new DayOff
                {
                    PersonId = request.PersoonId,
                    Date = day.Date,
                    Shift = day.Shift,
                    LeaveCategoryId = day.LeaveCategoryId,
                    Description = "", // Vul aan indien nodig
                    Status = DayOffstatus.Approved,
                    LastUpdate = DateTime.Now,
                    IsDeleted = false,// Of een andere default status

                };

                _context.DayOffs.Add(dayOff);
                newDayOffs.Add(dayOff);
                addedDates.Add(day.Date);
            }

            // Verlofcategorieën: moeten bij ploeg/specialiteit/jaar van de persoon horen en binnen het maximum blijven
            var finalDayOffs = existingDayOffs.Except(toRemove).Concat(newDayOffs).ToList();
            var categoryError = await ValidateLeaveCategoriesAsync(person, finalDayOffs);
            if (categoryError != null)
                return BadRequest(categoryError);

            // Recht CanSaveWorkCalendar nodig voor elk jaar waarin effectief iets wijzigt
            var changedYears = toRemove.Select(d => d.Date.Year)
                .Concat(addedDates.Select(d => d.Year))
                .Concat(recategorizedDates.Select(d => d.Year))
                .Distinct();
            foreach (var year in changedYears)
            {
                if (!await HasPermissionAsync(year, p => p.CanSaveWorkCalendar))
                    return Forbid();
            }

            await _context.SaveChangesAsync();

            return Ok(new
            {
                Added = addedDates,
                Skipped = skippedDates,
                Recategorized = recategorizedDates,
                Removed = toRemove.Select(d => d.Date)
            });
        }

        // Geeft een foutmelding terug als een categorie niet geldig is of het maximum overschreden wordt
        private async Task<string?> ValidateLeaveCategoriesAsync(Person person, List<DayOff> dayOffs)
        {
            var withCategory = dayOffs.Where(d => d.LeaveCategoryId != null).ToList();
            if (withCategory.Count == 0)
                return null;

            if (person.Team == null || person.Speciality == null)
                return "Verlofcategorieën vereisen een ploeg en specialiteit.";

            foreach (var yearGroup in withCategory.GroupBy(d => d.Date.Year))
            {
                var allowed = await _leaveCategories.GetApplicableAsync(person.Team.Value, person.Speciality.Value, yearGroup.Key);

                foreach (var catGroup in yearGroup.GroupBy(d => d.LeaveCategoryId!.Value))
                {
                    var category = allowed.FirstOrDefault(c => c.Id == catGroup.Key);
                    if (category == null)
                        return $"Verlofcategorie {catGroup.Key} is niet geldig voor {person.Team}/{person.Speciality} in {yearGroup.Key}.";

                    if (catGroup.Count() > category.MaxShifts)
                        return $"Maximaal {category.MaxShifts} shiften als '{category.Name}' in {yearGroup.Key} (nu {catGroup.Count()}).";

                    if (category.MustBeConsecutive && !IsConsecutive(person.Team.Value, yearGroup.Key, catGroup))
                        return $"De shiften van '{category.Name}' moeten aansluitend zijn (één ononderbroken reeks werkshiften).";
                }
            }

            return null;
        }

        // Aansluitend: de shiften vormen één reeks in het werkrooster van de ploeg (vrije dagen ertussen tellen niet)
        private bool IsConsecutive(TeamName team, int year, IEnumerable<DayOff> dayOffs)
        {
            var roster = _calendarService.GenerateWorkCalendar(new Team { Name = team }, year)
                .OrderBy(w => w.Date).ThenBy(w => w.Shift == "D" ? 0 : 1)
                .ToList();

            var positions = dayOffs
                .Select(d => roster.FindIndex(w => w.Date.Date == d.Date.Date && (d.Shift == null || w.Shift == d.Shift)))
                .ToList();

            if (positions.Any(p => p < 0))
                return false; // shift buiten het rooster
            if (positions.Count <= 1)
                return true;

            var distinct = positions.Distinct().ToList();
            return distinct.Count == positions.Count && distinct.Max() - distinct.Min() + 1 == distinct.Count;
        }

        [HttpGet("person-days-off/{personId}")]
        public async Task<IActionResult> GetDaysOffForPerson(int personId)
        {
            if (!await CanAccessPersonAsync(personId))
                return Forbid();
            var person = await _context.Persons.FindAsync(personId);
            if (person == null)
            {
                return NotFound($"Persoon met id {personId} niet gevonden.");
            }

            var daysOff = await _context.DayOffs
                .Where(d => d.PersonId == personId)
                .Select(d => new
                {
                    d.Date,
                    d.Shift,
                    d.LeaveCategoryId,
                    d.Description,
                    d.Status
                })
                .ToListAsync();

            return Ok(daysOff);
        }

        public class AddTeamDayOffsRequest
        {
            public int Year { get; set; }
            public List<PersonDays> Persons { get; set; }
            public class PersonDays
            {
                public int PersoonId { get; set; }
                public List<WorkDay> Days { get; set; }
            }
        }

        [HttpPost("add-multiple-dayoff")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> AddMultiplePersonsDayOffs([FromBody] AddTeamDayOffsRequest request)
        {
            // Een manager mag enkel personen aanpassen van de ploegen en specialiteiten die hij beheert,
            // en enkel als de regels (Manager Paneel) van die ploeg/specialiteit opslaan toelaten
            if (!_me.IsAdmin)
            {
                var ids = request.Persons.Select(p => p.PersoonId).Distinct().ToList();
                var targets = await _context.Persons.AsNoTracking()
                    .Where(p => ids.Contains(p.Id))
                    .Select(p => new { p.Team, p.Speciality })
                    .ToListAsync();
                if (targets.Count != ids.Count)
                    return Forbid();
                foreach (var group in targets.Distinct())
                {
                    if (!await _me.CanManageTeamAsync(group.Team, group.Speciality))
                        return Forbid();
                    var perms = await _access.GetPermissionsAsync(User, group.Team!.Value, group.Speciality!.Value, request.Year);
                    if (!perms.CanSaveTeamCalendar)
                        return Forbid();
                }
            }

            var personIds = request.Persons.Select(p => p.PersoonId).Distinct().ToList();
            var personsById = await _context.Persons.AsNoTracking()
                .Where(p => personIds.Contains(p.Id))
                .ToDictionaryAsync(p => p.Id);

            foreach (var person in request.Persons)
            {
                // Beperk tot het jaar dat bewerkt wordt
                var existingDayOffs = await _context.DayOffs
                    .Where(d => d.PersonId == person.PersoonId && d.Date.Year == request.Year)
                    .ToListAsync();
                var newDayOffs = new List<DayOff>();

                // Vergelijk (Date, Shift)
                var requested = person.Days
                    .Select(d => (d.Date.Date, d.Shift))
                    .ToHashSet();

                var toRemove = existingDayOffs
                    .Where(d => !requested.Contains((d.Date.Date, d.Shift)))
                    .ToList();

                if (toRemove.Count > 0)
                    _context.DayOffs.RemoveRange(toRemove);

                foreach (var day in person.Days)
                {
                    var existing = existingDayOffs.FirstOrDefault(d => d.Date.Date == day.Date.Date && d.Shift == day.Shift);
                    if (existing != null)
                    {
                        // Bestaande verlofshift: enkel de verlofcategorie kan wijzigen
                        if (existing.LeaveCategoryId != day.LeaveCategoryId)
                        {
                            existing.LeaveCategoryId = day.LeaveCategoryId;
                            existing.LastUpdate = DateTime.Now;
                        }
                        continue;
                    }

                    var dayOff = new DayOff
                    {
                        PersonId = person.PersoonId,
                        Date = day.Date,
                        Shift = day.Shift,
                        LeaveCategoryId = day.LeaveCategoryId,
                        Description = "",
                        Status = DayOffstatus.Approved,
                        LastUpdate = DateTime.Now,
                        IsDeleted = false
                    };
                    _context.DayOffs.Add(dayOff);
                    newDayOffs.Add(dayOff);
                }

                // Verlofcategorieën per persoon controleren (eigen ploeg/specialiteit, maximum)
                if (!personsById.TryGetValue(person.PersoonId, out var target))
                    return BadRequest($"Persoon {person.PersoonId} niet gevonden.");

                var categoryError = await ValidateLeaveCategoriesAsync(target, existingDayOffs.Except(toRemove).Concat(newDayOffs).ToList());
                if (categoryError != null)
                    return BadRequest($"{target.FirstName} {target.LastName}: {categoryError}");
            }

            await _context.SaveChangesAsync();
            return Ok();
        }

        // Jezelf, Admin, of een Manager voor iemand van zijn ploeg en specialiteit
        private async Task<bool> CanAccessPersonAsync(int personId)
        {
            if (_me.Id == personId || _me.IsAdmin)
                return true;
            if (!_me.IsManager)
                return false;

            var target = await _context.Persons.AsNoTracking()
                .Where(p => p.Id == personId)
                .Select(p => new { p.Team, p.Speciality })
                .FirstOrDefaultAsync();
            return target != null && await _me.CanManageTeamAsync(target.Team, target.Speciality);
        }

        // Rechten uit de CalendarAccessRules (Manager Paneel) van het team/specialiteit van de ingelogde gebruiker
        private async Task<bool> HasPermissionAsync(int year, Func<CalendarPermissionsDTO, bool> pick)
        {
            if (_me.IsAdmin)
                return true;

            var own = await _me.GetTeamAsync();
            if (own.Team == null || own.Speciality == null)
                return false;

            var perms = await _access.GetPermissionsAsync(User, own.Team.Value, own.Speciality.Value, year);
            return pick(perms);
        }
        //public class WorkDay
        //{
        //    public DateTime Date { get; set; }
        //}
        // DTO voor de request body
        //public class AddMultipleDayOffsRequest
        //{
        //    public int PersoonId { get; set; }
        //    public List<WorkDay> Days { get; set; } = new();
        //}
    }
}
