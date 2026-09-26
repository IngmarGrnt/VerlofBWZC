using AutoMapper;
using AutoMapper.QueryableExtensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Api.Helpers;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Enums;
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


        public PersonController(VerlofBWZC_DbContext context, IMapper mapper, IHttpContextFactory httpContextFactory, IConfiguration configuration, ILogger<PersonController> logger)
        {
            _context = context;
            _mapper = mapper;
            _httpContextFactory = httpContextFactory;
            _configuration = configuration;
            _logger = logger;
        }

        // GET: api/Person
        [HttpGet]
        [Route("/api/allPersons")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersons()
        {
            try
            {
                var personDTOs = await _context.Persons
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


        // GET: api/Person/id
        [HttpGet("{id}")]
        public async Task<ActionResult<Person>> GetPerson(int id)
        {
            if (!User.IsSelfOrAdminOrManager(id))
                return Forbid();

            var personDTO = await _context.Persons
            .Where(p => p.Id == id)
            .ProjectTo<PersonBaseDTO>(_mapper.ConfigurationProvider)
            .FirstOrDefaultAsync();

            if (personDTO == null)
            {
                return NotFound();
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


        [HttpGet("team/{teamName}/{speciality}")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersonsByTeam(TeamName teamName, Speciality speciality)
        {
            if (!await CanReadTeamAsync(teamName))
                return Forbid();

            var persons = await _context.Persons
                .Where(p => p.Team == teamName && p.Speciality == speciality)
                .ProjectTo<PersonBaseDTO>(_mapper.ConfigurationProvider)
                .ToListAsync();
            return Ok(persons);
        }

        // Alle leden van een ploeg, over alle specialiteiten heen
        [HttpGet("team/{teamName}")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersonsByTeamAllSpecialities(TeamName teamName)
        {
            if (!await CanReadTeamAsync(teamName))
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
            if (!await CanReadTeamAsync(teamName))
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
            var isAdmin = User.IsAdmin();
            if (!isAdmin && User.GetUserId() != id)
                return Forbid();

            var person = await _context.Persons.FindAsync(id);
            if (person == null)
                return NotFound();

            // Niet-admins mogen enkel hun eigen wachtwoord wijzigen, geen naam/team/rol
            if (!isAdmin)
            {
                if (string.IsNullOrEmpty(personDto.Password))
                    return BadRequest("Enkel het wachtwoord kan gewijzigd worden.");

                PasswordHelper.CreatePasswordHash(personDto.Password, out string ownHash, out string ownSalt);
                person.PasswordHash = ownHash;
                person.Salt = ownSalt;
                person.LastUpdate = DateTime.Now;
                await _context.SaveChangesAsync();
                return NoContent();
            }

            // Update velden (pas aan indien nodig)
            person.FirstName = personDto.FirstName;
            person.LastName = personDto.LastName;
            person.Team = Enum.TryParse<TeamName>(personDto.Team, out var team) ? team : null;
            person.Speciality = Enum.TryParse<Speciality>(personDto.Speciality, out var spec) ? spec : null;
            person.Grade = Enum.TryParse<Grade>(personDto.Grade, out var grade) ? grade : null;
            person.Role = Enum.TryParse<Role>(personDto.Role, out var role) ? role : null;
            person.LeaveAllowance = personDto.LeaveAllowance is >= 0 ? personDto.LeaveAllowance : null;
            person.LastUpdate = DateTime.Now;
            if (!string.IsNullOrEmpty(personDto.Password))
            {
                PasswordHelper.CreatePasswordHash(personDto.Password, out string hash, out string salt);
                person.PasswordHash = hash;
                person.Salt = salt;
            }

            await _context.SaveChangesAsync();
            return NoContent();
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

        // Admin/Manager zien elk team; anderen enkel hun eigen team
        private async Task<bool> CanReadTeamAsync(TeamName teamName)
        {
            if (User.IsAdminOrManager())
                return true;

            var userId = User.GetUserId();
            if (userId == null)
                return false;

            var ownTeam = await _context.Persons
                .Where(p => p.Id == userId)
                .Select(p => p.Team)
                .FirstOrDefaultAsync();

            return ownTeam == teamName;
        }
    }
}
