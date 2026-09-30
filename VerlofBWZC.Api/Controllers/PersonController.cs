using AutoMapper;
using AutoMapper.QueryableExtensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
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
        private readonly RefreshTokenService _refresh;


        public PersonController(VerlofBWZC_DbContext context, IMapper mapper, IHttpContextFactory httpContextFactory, IConfiguration configuration, ILogger<PersonController> logger, UserContext me, RefreshTokenService refresh)
        {
            _context = context;
            _mapper = mapper;
            _httpContextFactory = httpContextFactory;
            _configuration = configuration;
            _logger = logger;
            _me = me;
            _refresh = refresh;
        }

        // GET: api/Person — Admin alle personen, Manager enkel zijn ploeg en specialiteit
        [HttpGet]
        [Route("/api/allPersons")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersons()
        {
            try
            {
                // Nog niet goedgekeurde registraties staan apart (api/person/pending)
                var query = _context.Persons.Where(p => p.IsApproved);
                if (!_me.IsAdmin)
                {
                    // Manager: personen van de ploegen en specialiteiten die hij beheert
                    var keys = await _me.GetScopeKeysAsync();
                    query = query.Where(p => p.Team != null && p.Speciality != null
                        && keys.Contains((int)p.Team.Value * 100 + (int)p.Speciality.Value));
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
        public async Task<ActionResult<TemporaryPasswordDTO>> CreatePerson(PersonCreateDTO personDTO)
        {
            if (!ModelState.IsValid)
                return BadRequest(ModelState);

            // Geen vast of zelfgekozen wachtwoord meer: een willekeurig tijdelijk wachtwoord dat de persoon
            // bij de eerste login moet wijzigen. Het wordt enkel nu één keer teruggegeven.
            var temporary = PasswordHelper.GenerateTemporaryPassword();
            PasswordHelper.CreatePasswordHash(temporary, out string hash, out string salt);
            personDTO.PasswordHash = hash;
            personDTO.Salt = salt;
            personDTO.Email = personDTO.Email?.Trim() ?? "";
            personDTO.FirstName = personDTO.FirstName?.Trim() ?? "";
            personDTO.LastName = personDTO.LastName?.Trim() ?? "";
            var person = _mapper.Map<Person>(personDTO);
            person.PasswordIterations = PasswordHelper.CurrentIterations;
            person.MustChangePassword = true;
            person.LeaveAllowance ??= PersonDefaults.LeaveAllowance;
            // Initialen: ingevuld of volgens de standaardregel op de achternaam
            person.Initials = PersonInitials.Normalize(personDTO.Initials, personDTO.LastName);
            if (await InitialsConflictAsync(person) is string createConflict)
                return BadRequest(createConflict);
            _context.Persons.Add(person);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return BadRequest("Dit e-mailadres is al in gebruik.");
            }

            return CreatedAtAction(nameof(GetPerson), new { id = person.Id }, new TemporaryPasswordDTO { PersonId = person.Id, TemporaryPassword = temporary });
        }

        private const int MaxFailedLogins = 5;
        private static readonly TimeSpan LockoutDuration = TimeSpan.FromMinutes(15);

        [HttpPost("login")]
        [AllowAnonymous]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> Login([FromBody] LoginDTO loginDto)
        {
            const string invalid = "Ongeldige gebruikersnaam of wachtwoord.";
            var email = loginDto.Email?.Trim() ?? "";
            Person? person = await _context.Persons.SingleOrDefaultAsync(p => p.Email == email);
            if (person == null)
            {
                // Evenveel rekenwerk als bij een bestaand account, zodat de responstijd niet verraadt of het e-mailadres bestaat
                PasswordHelper.VerifyPassword(loginDto.Password ?? "", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "AAAAAAAAAAAAAAAAAAAAAA==", PasswordHelper.CurrentIterations);
                return Unauthorized(invalid);
            }

            if (person.LockoutUntilUtc is DateTime until && until > DateTime.UtcNow)
                return Unauthorized($"Te veel foute pogingen. Probeer het opnieuw over {Math.Max(1, (int)Math.Ceiling((until - DateTime.UtcNow).TotalMinutes))} minuten.");

            if (!PasswordHelper.VerifyPassword(loginDto.Password ?? "", person.PasswordHash, person.Salt, person.PasswordIterations))
            {
                person.FailedLoginCount++;
                if (person.FailedLoginCount >= MaxFailedLogins)
                {
                    person.LockoutUntilUtc = DateTime.UtcNow.Add(LockoutDuration);
                    person.FailedLoginCount = 0;
                    await _context.SaveChangesAsync();
                    return Unauthorized($"Te veel foute pogingen. Je account is {LockoutDuration.TotalMinutes:0} minuten geblokkeerd.");
                }
                await _context.SaveChangesAsync();
                return Unauthorized(invalid);
            }

            // Zelf geregistreerd: pas inloggen na goedkeuring
            if (!person.IsApproved)
                return Unauthorized("Je registratie wacht nog op goedkeuring door een verantwoordelijke.");

            person.FailedLoginCount = 0;
            person.LockoutUntilUtc = null;

            // Oude, zwakkere hash omzetten nu we het wachtwoord kennen
            if (person.PasswordIterations < PasswordHelper.CurrentIterations)
            {
                PasswordHelper.CreatePasswordHash(loginDto.Password!, out var newHash, out var newSalt);
                person.PasswordHash = newHash;
                person.Salt = newSalt;
                person.PasswordIterations = PasswordHelper.CurrentIterations;
            }

            // Zwak of standaardwachtwoord (bv. het vroegere vaste wachtwoord): eerst een nieuw kiezen
            if (PasswordPolicy.Validate(loginDto.Password, person.Email, person.FirstName, person.LastName) != null)
                person.MustChangePassword = true;

            await _context.SaveChangesAsync();

            string token = JwtTokenHelper.GenerateJwtToken(person, _configuration);
            // Vernieuwingstoken pas met een volwaardig token (niet zolang eerst het wachtwoord gewijzigd moet worden)
            var refreshToken = person.MustChangePassword ? null : await _refresh.IssueAsync(person.Id, loginDto.RememberMe);
            return Ok(new LoginResultDTO { Token = token, MustChangePassword = person.MustChangePassword, RefreshToken = refreshToken });
        }

        // Ingelogd blijven: het vernieuwingstoken van dit toestel inruilen voor een nieuw token (en een nieuw vernieuwingstoken)
        [HttpPost("refresh")]
        [AllowAnonymous]
        [EnableRateLimiting("refresh")]
        public async Task<IActionResult> Refresh([FromBody] RefreshRequestDTO dto)
        {
            var result = await _refresh.RotateAsync(dto.RefreshToken);
            if (result is not var (person, next))
                return Unauthorized("Je sessie is verlopen. Log opnieuw in.");

            return Ok(new LoginResultDTO
            {
                Token = JwtTokenHelper.GenerateJwtToken(person, _configuration),
                MustChangePassword = false,
                RefreshToken = next
            });
        }

        // Uitloggen: het vernieuwingstoken van dit toestel intrekken
        [HttpPost("logout")]
        [AllowAnonymous]
        [EnableRateLimiting("refresh")]
        public async Task<IActionResult> Logout([FromBody] RefreshRequestDTO dto)
        {
            await _refresh.RevokeAsync(dto.RefreshToken);
            return NoContent();
        }

        // Zelf registreren (loginpagina): enkel @bwzc.be, Ploeg1, rol User, 44 verlofshiften, zelfgekozen wachtwoord.
        // Het account werkt pas na goedkeuring door de Admin of een Manager van die ploeg en specialiteit.
        [HttpPost("register")]
        [AllowAnonymous]
        [EnableRateLimiting("register")]
        public async Task<IActionResult> Register([FromBody] RegisterDTO dto)
        {
            var firstName = dto.FirstName?.Trim() ?? "";
            var lastName = dto.LastName?.Trim() ?? "";
            var email = dto.Email?.Trim().ToLowerInvariant() ?? "";

            if (firstName.Length == 0 || lastName.Length == 0)
                return BadRequest("Vul je voornaam en naam in.");
            if (firstName.Length > 100 || lastName.Length > 100)
                return BadRequest("Voornaam of naam is te lang.");
            if (!email.EndsWith(RegistrationRules.EmailDomain) || email.Length <= RegistrationRules.EmailDomain.Length
                || email.Count(c => c == '@') != 1 || email.Contains(' '))
                return BadRequest($"Gebruik je e-mailadres van de zone ({RegistrationRules.EmailDomain}).");
            if (!Enum.TryParse<Speciality>(dto.Speciality, true, out var speciality))
                return BadRequest("Kies je specialiteit.");
            if (!Enum.TryParse<Grade>(dto.Grade, true, out var grade))
                return BadRequest("Kies je graad.");
            if (PasswordPolicy.Validate(dto.Password, email, firstName, lastName) is string policyError)
                return BadRequest(policyError);

            if (await _context.Persons.AnyAsync(p => p.Email == email))
                return BadRequest("Dit adres heeft al een account. Wachtwoord vergeten? Vraag je verantwoordelijke om het te resetten.");

            PasswordHelper.CreatePasswordHash(dto.Password, out var hash, out var salt);
            var person = new Person
            {
                FirstName = firstName,
                LastName = lastName,
                Email = email,
                PasswordHash = hash,
                Salt = salt,
                PasswordIterations = PasswordHelper.CurrentIterations,
                Team = Enum.Parse<TeamName>(RegistrationRules.Team),
                Speciality = speciality,
                Grade = grade,
                Role = Role.User,
                LeaveAllowance = PersonDefaults.LeaveAllowance,
                // Dubbele initialen worden bij het goedkeuren gemeld (niet tegengehouden: de persoon kan ze niet zelf kiezen)
                Initials = PersonInitials.Normalize(null, lastName),
                IsApproved = false,
                RegisteredAtUtc = DateTime.UtcNow,
                LastUpdate = DateTime.Now
            };
            _context.Persons.Add(person);
            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateException)
            {
                return BadRequest("Dit adres heeft al een account.");
            }
            return Ok();
        }

        // Registraties die wachten op goedkeuring (Admin: alle; Manager: zijn ploegen en specialiteiten)
        [HttpGet("pending")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPending()
        {
            var query = _context.Persons.Where(p => !p.IsApproved);
            if (!_me.IsAdmin)
            {
                var keys = await _me.GetScopeKeysAsync();
                query = query.Where(p => p.Team != null && p.Speciality != null
                    && keys.Contains((int)p.Team.Value * 100 + (int)p.Speciality.Value));
            }
            return Ok(await query
                .OrderBy(p => p.RegisteredAtUtc)
                .ProjectTo<PersonBaseDTO>(_mapper.ConfigurationProvider)
                .ToListAsync());
        }

        [HttpPost("{id}/approve")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Approve(int id)
        {
            var person = await _context.Persons.FindAsync(id);
            if (person == null || person.IsApproved)
                return NotFound();
            if (!await _me.CanManageTeamAsync(person.Team, person.Speciality))
                return Forbid();

            person.IsApproved = true;
            person.LastUpdate = DateTime.Now;
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Weigeren: de registratie wordt verwijderd (de persoon kan zich opnieuw registreren)
        [HttpPost("{id}/reject")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<IActionResult> Reject(int id)
        {
            var person = await _context.Persons.FindAsync(id);
            if (person == null || person.IsApproved)
                return NotFound();
            if (!await _me.CanManageTeamAsync(person.Team, person.Speciality))
                return Forbid();

            _context.Persons.Remove(person);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        // Zelf je wachtwoord wijzigen: huidig wachtwoord verplicht. Ook toegelaten met het beperkte token.
        [HttpPost("change-password")]
        [EnableRateLimiting("login")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordDTO dto)
        {
            if (_me.IsDemo)
                return Forbid();

            var person = await _context.Persons.FindAsync(_me.Id);
            if (person == null)
                return Unauthorized();

            if (!PasswordHelper.VerifyPassword(dto.CurrentPassword ?? "", person.PasswordHash, person.Salt, person.PasswordIterations))
                return BadRequest("Het huidige wachtwoord is niet juist.");

            if (PasswordPolicy.Validate(dto.NewPassword, person.Email, person.FirstName, person.LastName) is string policyError)
                return BadRequest(policyError);

            if (dto.NewPassword == dto.CurrentPassword)
                return BadRequest("Kies een ander wachtwoord dan het huidige.");

            PasswordHelper.CreatePasswordHash(dto.NewPassword, out var hash, out var salt);
            person.PasswordHash = hash;
            person.Salt = salt;
            person.PasswordIterations = PasswordHelper.CurrentIterations;
            person.MustChangePassword = false;
            person.FailedLoginCount = 0;
            person.LockoutUntilUtc = null;
            person.LastUpdate = DateTime.Now;
            await _context.SaveChangesAsync();

            // Nieuw wachtwoord: andere toestellen afmelden; dit toestel krijgt een nieuw token en vernieuwingstoken
            await _refresh.RevokeAllAsync(person.Id);
            return Ok(new LoginResultDTO
            {
                Token = JwtTokenHelper.GenerateJwtToken(person, _configuration),
                MustChangePassword = false,
                RefreshToken = await _refresh.IssueAsync(person.Id, dto.RememberMe)
            });
        }

        // Admin (iedereen) of Manager (eigen ploeg en specialiteit, geen Admin): nieuw tijdelijk wachtwoord
        [HttpPost("{id}/reset-password")]
        [Authorize(Roles = "Admin,Manager")]
        public async Task<ActionResult<TemporaryPasswordDTO>> ResetPassword(int id)
        {
            var person = await _context.Persons.FindAsync(id);
            if (person == null)
                return _me.IsAdmin ? NotFound() : Forbid();

            if (!_me.IsAdmin && (person.Role == Role.Admin || !await _me.CanManageTeamAsync(person.Team, person.Speciality)))
                return Forbid();

            var temporary = PasswordHelper.GenerateTemporaryPassword();
            PasswordHelper.CreatePasswordHash(temporary, out var hash, out var salt);
            person.PasswordHash = hash;
            person.Salt = salt;
            person.PasswordIterations = PasswordHelper.CurrentIterations;
            person.MustChangePassword = true;
            person.FailedLoginCount = 0;
            person.LockoutUntilUtc = null;
            person.LastUpdate = DateTime.Now;
            await _context.SaveChangesAsync();

            // Alle toestellen van deze persoon afmelden: inloggen kan enkel nog met het tijdelijke wachtwoord
            await _refresh.RevokeAllAsync(person.Id);

            return Ok(new TemporaryPasswordDTO { PersonId = person.Id, TemporaryPassword = temporary });
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

            // Manager: optioneel extra ploegen/specialiteiten om te bekijken hoe een manager van meerdere ploegen het ziet
            var scopeParts = new List<string>();
            if (role == Role.Manager)
            {
                foreach (var s in request.Scopes ?? new())
                {
                    if (!Enum.TryParse<TeamName>(s.Team, true, out var st))
                        return BadRequest($"Ongeldige ploeg: {s.Team}");
                    if (string.IsNullOrWhiteSpace(s.Speciality))
                        scopeParts.Add($"{st}:*");
                    else if (Enum.TryParse<Speciality>(s.Speciality, true, out var ss))
                        scopeParts.Add($"{st}:{ss}");
                    else
                        return BadRequest($"Ongeldige specialiteit: {s.Speciality}");
                }
            }

            var token = JwtTokenHelper.GenerateDemoToken(admin, role.ToString(), team.ToString(), spec.ToString(), _configuration,
                scopeParts.Count > 0 ? string.Join(";", scopeParts.Distinct()) : null);
            return Ok(new { token });
        }


        [HttpGet("team/{teamName}/{speciality}")]
        public async Task<ActionResult<IEnumerable<PersonBaseDTO>>> GetPersonsByTeam(TeamName teamName, Speciality speciality)
        {
            if (!await _me.CanReadTeamAsync(teamName, speciality))
                return Forbid();

            var persons = await _context.Persons
                .Where(p => p.Team == teamName && p.Speciality == speciality && p.IsApproved)
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
                .Where(p => p.Team == teamName && p.IsApproved)
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
                // Manager, eigen ploeg + specialiteit: naam, initialen, e-mail, rol (nooit Admin) en verlofaantal.
                // Wachtwoord: enkel resetten naar een tijdelijk wachtwoord (reset-password).
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
                // Eigen wachtwoord wijzigen gaat via api/person/change-password (met huidig wachtwoord)
                return BadRequest("Wijzig je wachtwoord via Wachtwoord wijzigen.");
            }
            else
            {
                return Forbid();
            }

            // Zelfde initialen binnen dezelfde ploeg en specialiteit mag niet
            if ((person.Initials, person.Team, person.Speciality) != before && await InitialsConflictAsync(person) is string conflict)
                return BadRequest(conflict);

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
