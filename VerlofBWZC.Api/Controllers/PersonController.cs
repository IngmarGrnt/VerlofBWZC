using AutoMapper;
using AutoMapper.QueryableExtensions;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataContracts.DTO;
using VerlofBWZC.DataContracts.Helpers;


namespace VerlofBWZC.Api.Controllers
{

    [ApiController]
    [Route("api/[controller]")]
    public class PersonController : Controller
    {

        private readonly VerlofBWZC_DbContext _context;
        private readonly IMapper _mapper;
        private readonly IHttpContextFactory _httpContextFactory;
        private readonly ConfigurationBuilder _configurationBuilder;
        private readonly IConfiguration _configuration;


        public PersonController(VerlofBWZC_DbContext context, IMapper mapper, IHttpContextFactory httpContextFactory, IConfiguration configuration)
        {
            _context = context;
            _mapper = mapper;
            _httpContextFactory = httpContextFactory;
            _configuration = configuration;
        }

        // GET: api/Person
        [HttpGet]
        [Route("/api/allPersons")]
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
                return StatusCode(500, "Er is een fout opgetreden bij het ophalen van een personen)");
            }
        }


        // GET: api/Person/id
        [HttpGet("{id}")]
        public async Task<ActionResult<Person>> GetPerson(int id)
        {
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
        public async Task<ActionResult<PersonBaseDTO>> CreatePerson(PersonCreateDTO personDTO)
        {
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
        public async Task<IActionResult> Login([FromBody] LoginDTO loginDto)
        {
            Person person = await _context.Persons.SingleOrDefaultAsync(p => p.Email == loginDto.Email);
            if (person == null)
                return Unauthorized("Ongeldige gebruikersnaam of wachtwoord.");

            if (!PasswordHelper.VerifyPassword(loginDto.Password, person.PasswordHash, person.Salt))
                return Unauthorized("Ongeldige gebruikersnaam of wachtwoord.");
     
            string token = JwtTokenHelper.GenerateJwtToken(person, _configuration);

            Console.WriteLine("token: " + token);
           //token= "testtoken123"; // tijdelijk voor testen
            return Ok(new { token });
        }
    }
}
