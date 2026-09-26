using AutoMapper;
using AutoMapper.QueryableExtensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.Api.Services;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
using VerlofBWZC.DataContracts;
using VerlofBWZC.DataContracts.DTO;


namespace VerlofBWZC.Api.Controllers
{

    [ApiController]
    [Route("api/[controller]")]
    public class PersonController : Controller
    {

        private readonly VerlofBWZC_DbContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextFactory _httpContextFactory;
        //private readonly ConfigurationBuilder _configurationBuilder;
        private readonly IConfiguration _configuration;
        private readonly ILogger<PersonController> _logger;
        private readonly UserContext _me;


        public PersonController(VerlofBWZC_DbContext context, IMapper mapper, IHttpContextFactory httpContextFactory, IConfiguration configuration, ILogger<PersonController> logger, UserContext me)
        {
            _context = context;
            _mapper = mapper;
            _httpContextFactory = httpContextFactory;
            _configuration = configuration;
            _logger = logger;
            _me = me;
        }

        // GET: api/Person — Admin alle personen, Manager enkel zijn ploeg en specialiteit
        [HttpGet]
        [Route("/api/allPersons")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersons()
        {
            try
            {
                var query = _context.Persons.AsQueryable();
                if (!_me.IsAdmin)
                {
                    var own = await _me.GetTeamAsync();
                    query = query.Where(p => p.Team == own.Team && p.Speciality == own.Speciality);
                }

                var personDTOs = await query
                    .ProjectTo<PersonBaseDTO>(_mapper.ConfigurationProvider)
                    .ToListAsync();

                return Ok(personDTOs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Fout bij ophalen personen");
                return StatusCode(500, "Er is een fout opgetreden bij het ophalen van de personen.");
            }
        }


        // GET: api/Person/id — jezelf, Admin, of Manager voor zijn ploeg en specialiteit
        [HttpGet("{id}")]
        public async Task<ActionResult<Person>> GetPerson(int id)
        {
            var personDTO = await _context.Persons
            .Where(p => p.Id == id)
            .ProjectTo<PersonBaseDTO>(_mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

            if (personDTO == null)
            {
                return _me.IsAdmin ? NotFound() : Forbid();
            }

            var isSelf = _me.Id == id;
            if (!isSelf && !_me.IsAdmin && !await CanManagePersonDtoAsync(personDTO))
                return Forbid();

            // Demo modus: je eigen profiel toont de gekozen rol, ploeg en specialiteit
            if (isSelf && _me.IsDemo)
            {
                var demo = await _me.GetTeamAsync();
                personDTO.Team = demo.Team?.ToString();
                personDTO.Speciality = demo.Speciality?.ToString();
                personDTO.Role = User.IsAdmin() ? "Admin" : User.IsInRole("Manager") ? "Manager" : "User";
            }

            return Ok(personDTO);

        }

        [HttpPost]
        [Authorize(Roles = "Admin")]
        public async Task<ActionResult<PersonBaseDTO>> CreatePerson(PersonCreateDTO personDTO)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            if (string.IsNullOrWhiteSpace(personDTO.Password))
                return BadRequest("Wachtwoord is verplicht.");

            PasswordHelper.CreatePasswordHash(personDTO.Password, out string hash, out string salt);
            personDTO.PasswordHash = hash;
            personDTO.Salt = salt;
            var person = _mapper.Map<Person>(personDTO);
            // Initialen: ingevuld of volgens de standaardregel op de achternaam
            person.Initials = PersonInitials.Normalize(personDTO.Initials, personDTO.LastName);
            if (await InitialsConflictAsync(person) is string createConflict)
                return BadRequest(createConflict);
            _context.Persons.Add(person);
            await _context.SaveChangesAsync();

            // Map naar een veilige DTO zonder wachtwoordvelden
            var responseDto = _mapper.Map<PersonBaseDTO>(person);
            return CreatedAtAction(nameof(GetPerson), new { id = person.Id }, responseDto);
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<IActionResult> Login([FromBody] LoginDTO loginDto)
        {
            Person person = await _context.Persons.SingleOrDefaultAsync(p => p.Email == loginDto.Email);
            if (person == null)
                return Unauthorized("Ongeldige gebruikersnaam of wachtwoord.");

            if (!PasswordHelper.VerifyPassword(loginDto.Password, person.PasswordHash, person.Salt))
                return Unauthorized("Ongeldige gebruikersnaam of wachtwoord.");

            string token = JwtTokenHelper.GenerateJwtToken(person, _configuration);
            return Ok(new { token });
        }

        // Demo modus: een admin bekijkt de app als een gekozen rol, ploeg en specialiteit (enkel lezen)
        [HttpPost("demo")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> StartDemo([FromBody] DemoRequestDTO request)
        {
            // Enkel een echte admin (geen demo-token) volgens de databank
            if (_me.IsDemo)
                return Forbid();

            var admin = await _context.Persons.FindAsync(_me.Id);
            if (admin == null || admin.Role != Role.Admin)
                return Forbid();

            if (!Enum.TryParse<Role>(request.Role, true, out var role))
                return BadRequest("Ongeldige rol.");
            if (!Enum.TryParse<TeamName>(request.Team, true, out var team))
                return BadRequest("Ongeldige ploeg.");
            if (!Enum.TryParse<Speciality>(request.Speciality, true, out var spec))
                return BadRequest("Ongeldige specialiteit.");

            var token = JwtTokenHelper.GenerateDemoToken(admin, role.ToString(), team.ToString(), spec.ToString(), _configuration);
            return Ok(new { token });
        }


        [HttpGet("team/{teamName}/{speciality}")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersonsByTeam(TeamName teamName, Speciality speciality)
        {
            if (!await _me.CanReadTeamAsync(teamName, speciality))
                return Forbid();

            var persons = await _context.Persons
                .Where(p => p.Team == teamName && p.Speciality == speciality)
                .ProjectTo<PersonBaseDTO>(_mapper.ConfigurationProvider)
                .ToListAsync();
            return Ok(persons);
        }

        // Alle leden van een ploeg, over alle specialiteiten heen (enkel Admin)
        [HttpGet("team/{teamName}")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersonsByTeamAllSpecialities(TeamName teamName)
        {
            if (!await _me.CanReadTeamAsync(teamName, null))
                return Forbid();

            var persons = await _context.Persons
                .Where(p => p.Team == teamName)
                .OrderBy(p => p.Speciality).ThenBy(p => p.LastName)
                .ProjectTo<PersonBaseDTO>(_mapper.ConfigurationProvider)
                .ToListAsync();
            return Ok(persons);
        }

        [HttpGet("team-days-off/{teamName}/{year}/{speciality?}")]
        public async Task<IActionResult> GetDaysOffForTeam(TeamName teamName, int year, Speciality? speciality = null)
        {
            if (!await _me.CanReadTeamAsync(teamName, speciality))
                return Forbid();

            var personsQuery = _context.Persons.Where(p => p.Team == teamName);

            if (speciality.HasValue)
            {
                personsQuery = personsQuery.Where(p => p.Speciality == speciality.Value);
            }

            var personIds = await personsQuery
                .Select(p => p.Id)
                .ToListAsync();

            var daysOff = await _context.DayOffs
                .Where(d => personIds.Contains(d.PersonId) && d.Date.Year == year)
                .Select(d => new {
                    d.PersonId,
                    d.Date,
                    d.Shift, // <-- Shift wordt nu meegestuurd
                    d.LeaveCategoryId
                })
                .ToListAsync();

            return Ok(daysOff);
        }

        //[HttpPut("{id}")]
        [HttpPost("update/{id}")]
        public async Task<IActionResult> UpdatePersonPost(int id, [FromBody] PersonCreateDTO personDto)
        {
            var person = await _context.Persons.FindAsync(id);
            if (person == null)
                return _me.IsAdmin ? NotFound() : Forbid();

            // Om enkel te controleren als initialen, ploeg of specialiteit wijzigen
            var before = (person.Initials, person.Team, person.Speciality);

            if (_me.IsAdmin)
            {
                // Admin: alle velden
                person.FirstName = personDto.FirstName;
                person.LastName = personDto.LastName;
                if (!string.IsNullOrWhiteSpace(personDto.Email))
                    person.Email = personDto.Email.Trim();
                person.Team = Enum.TryParse<TeamName>(personDto.Team, out var team) ? team : null;
                person.Speciality = Enum.TryParse<Speciality>(personDto.Speciality, out var spec) ? spec : null;
                person.Grade = Enum.TryParse<Grade>(personDto.Grade, out var grade) ? grade : null;
                person.Role = Enum.TryParse<Role>(personDto.Role, out var role) ? role : null;
                person.LeaveAllowance = personDto.LeaveAllowance is >= 0 ? personDto.LeaveAllowance : null;
                person.Initials = PersonInitials.Normalize(personDto.Initials, personDto.LastName);
            }
            else if (_me.IsManager && await _me.CanManageTeamAsync(person.Team, person.Speciality))
            {
                // Manager, eigen ploeg + specialiteit: naam, e-mail, rol (nooit Admin), verlofaantal en wachtwoord.
                // Admin-accounts en ploeg/specialiteit/graad blijven onaangeroerd.
                if (person.Role == Role.Admin)
                    return Forbid();
                if (!Enum.TryParse<Role>(personDto.Role, out var newRole) || newRole == Role.Admin)
                    return BadRequest("Een manager kan enkel de rol User of Manager toekennen.");

                person.FirstName = personDto.FirstName;
                person.LastName = personDto.LastName;
                if (!string.IsNullOrWhiteSpace(personDto.Email))
                    person.Email = personDto.Email.Trim();
                person.Role = newRole;
                person.LeaveAllowance = personDto.LeaveAllowance is >= 0 ? personDto.LeaveAllowance : null;
                person.Initials = PersonInitials.Normalize(personDto.Initials, personDto.LastName);
            }
            else if (_me.Id == id)
            {
                // Iedereen: enkel het eigen wachtwoord wijzigen
                if (string.IsNullOrEmpty(personDto.Password))
                    return BadRequest("Enkel het wachtwoord kan gewijzigd worden.");
            }
            else
            {
                return Forbid();
            }

            // Zelfde initialen binnen dezelfde ploeg en specialiteit mag niet
            if ((person.Initials, person.Team, person.Speciality) != before && await InitialsConflictAsync(person) is string conflict)
                return BadRequest(conflict);

            if (!string.IsNullOrEmpty(personDto.Password))
            {
                PasswordHelper.CreatePasswordHash(personDto.Password, out string hash, out string salt);
                person.PasswordHash = hash;
                person.Salt = salt;
            }
            person.LastUpdate = DateTime.Now;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return BadRequest("Dit e-mailadres is al in gebruik.");
            }
            return NoContent();
        }

        // Initialen moeten uniek zijn binnen dezelfde ploeg en specialiteit (daarbuiten mag hetzelfde)
        private async Task<string?> InitialsConflictAsync(Person p)
        {
            if (string.IsNullOrEmpty(p.Initials) || p.Team == null || p.Speciality == null)
                return null;

            var others = await _context.Persons
                .Where(o => o.Id != p.Id && o.Team == p.Team && o.Speciality == p.Speciality && o.Initials == p.Initials)
                .Select(o => o.FirstName + " " + o.LastName)
                .ToListAsync();

            return others.Count == 0
                ? null
                : $"De initialen {p.Initials} worden in dezelfde ploeg en specialiteit al gebruikt door {string.Join(", ", others)}. Kies andere initialen.";
        }

        [HttpDelete("{id}")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DeletePerson(int id)
        {
            var person = await _context.Persons.FindAsync(id);
            if (person == null)
                return NotFound();

            _context.Persons.Remove(person);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private async Task<bool> CanManagePersonDtoAsync(PersonBaseDTO p)
        {
            var team = Enum.TryParse<TeamName>(p.Team, out var t) ? t : (TeamName?)null;
            var spec = Enum.TryParse<Speciality>(p.Speciality, out var s) ? s : (Speciality?)null;
            return await _me.CanManageTeamAsync(team, spec);
        }
    }
}
