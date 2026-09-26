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

        // DTO voor de request body
        public class AddDayOffRequest
        {
            public int PersonId { get; set; }
            public DateTime Date { get; set; }
            public string? Description { get; set; }
            public DayOffstatus? Status { get; set; }
        }

        public CalenderController(VerlofBWZC_DbContext context, CalendarHelper calendarService, CalendarAccessService access, LeaveCategoryService leaveCategories)
        {
            _context = context;
            _calendarService = calendarService;
            _access = access;
            _leaveCategories = leaveCategories;
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
            if (!User.IsSelfOrAdminOrManager(request.PersoonId))
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
                }
            }

            return null;
        }

        [HttpGet("person-days-off/{personId}")]
        public async Task<IActionResult> GetDaysOffForPerson(int personId)
        {
            if (!User.IsSelfOrAdminOrManager(personId))
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
            if (!await HasPermissionAsync(request.Year, p => p.CanSaveTeamCalendar))
                return Forbid();

            // Een manager mag enkel personen van zijn eigen team en specialiteit aanpassen
            if (!User.IsAdmin())
            {
                var me = await GetCurrentPersonAsync();
                if (me == null)
                    return Forbid();

                var ids = request.Persons.Select(p => p.PersoonId).Distinct().ToList();
                var allowedCount = await _context.Persons
                    .CountAsync(p => ids.Contains(p.Id) && p.Team == me.Team && p.Speciality == me.Speciality);
                if (allowedCount != ids.Count)
                    return Forbid();
            }

            foreach (var person in request.Persons)
            {
                // Beperk tot het jaar dat bewerkt wordt
                var existingDayOffs = await _context.DayOffs
                    .Where(d => d.PersonId == person.PersoonId && d.Date.Year == request.Year)
                    .ToListAsync();

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
                    bool exists = existingDayOffs.Any(d => d.Date.Date == day.Date.Date && d.Shift == day.Shift);
                    if (!exists)
                    {
                        _context.DayOffs.Add(new DayOff
                        {
                            PersonId = person.PersoonId,
                            Date = day.Date,
                            Shift = day.Shift,
                            Description = "",
                            Status = DayOffstatus.Approved,
                            LastUpdate = DateTime.Now,
                            IsDeleted = false
                        });
                    }
                }
            }

            await _context.SaveChangesAsync();
            return Ok();
        }

        private async Task<Person?> GetCurrentPersonAsync()
        {
            var userId = User.GetUserId();
            return userId == null ? null : await _context.Persons.AsNoTracking().FirstOrDefaultAsync(p => p.Id == userId);
        }

        // Rechten uit de CalendarAccessRules (Manager Paneel) van het team/specialiteit van de ingelogde gebruiker
        private async Task<bool> HasPermissionAsync(int year, Func<CalendarPermissionsDTO, bool> pick)
        {
            if (User.IsAdmin())
                return true;

            var me = await GetCurrentPersonAsync();
            if (me?.Team == null || me.Speciality == null)
                return false;

            var perms = await _access.GetPermissionsAsync(User, me.Team.Value, me.Speciality.Value, year);
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
