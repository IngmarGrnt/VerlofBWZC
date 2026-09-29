using System.Net.Http.Json;
using VerlofBWZC.DataContracts.DTO.Access;

namespace VerlofBWZC.Services
{
    // Welke ploegen en specialiteiten de ingelogde gebruiker mag kiezen in de schermen.
    // Admin: alles. Manager: zijn eigen ploeg + specialiteit en wat de Admin hem gaf. Anderen: enkel de eigen.
    // view = true: enkel bekijken (teamkalender). Dan komen er bij Dispatching alle ploegen bij als het
    // Manager Paneel dat toelaat (ViewScopes). Nooit gebruiken voor schermen waar je iets beheert.
    public class ScopeService
    {
        private readonly HttpClient _http;
        private MyScopeDTO? _scope;
        private List<string>? _allTeams;
        private List<string>? _allSpecialities;

        public ScopeService(HttpClient http)
        {
            _http = http;
        }

        public const string AllSpecialities = "Alle specialiteiten";

        public bool IsAdmin => _scope?.IsAdmin ?? false;

        private List<ScopeItemDTO> Items(bool view) =>
            view && (_scope?.ViewScopes.Count ?? 0) > 0 ? _scope!.ViewScopes : _scope?.Scopes ?? new();

        // Meer dan één keuze: dan tonen de schermen keuzelijsten
        public bool HasChoice => HasChoiceFor(view: false);
        public bool HasViewChoice => HasChoiceFor(view: true);

        private bool HasChoiceFor(bool view) =>
            IsAdmin || Items(view).Count > 1 || Items(view).Any(s => s.Speciality == null);

        public async Task LoadAsync(bool refresh = false)
        {
            if (_scope != null && !refresh)
                return;
            _scope = await _http.GetFromJsonAsync<MyScopeDTO>("api/meta/my-scope") ?? new MyScopeDTO();
            _allTeams ??= await _http.GetFromJsonAsync<List<string>>("api/meta/teams") ?? new();
            _allSpecialities ??= await _http.GetFromJsonAsync<List<string>>("api/meta/specialities") ?? new();
        }

        // Na afmelden/inloggen of demo modus: opnieuw ophalen
        public void Reset() => _scope = null;

        public List<string> Teams => TeamsOf(view: false);
        public List<string> ViewTeams => TeamsOf(view: true);

        private List<string> TeamsOf(bool view) => IsAdmin
            ? _allTeams ?? new()
            : Items(view).Select(s => s.Team).Distinct().OrderBy(t => (_allTeams ?? new()).IndexOf(t)).ToList();

        public List<string> AllSpecialityNames => _allSpecialities ?? new();

        // Specialiteiten die binnen een ploeg gekozen mogen worden
        public List<string> SpecialitiesFor(string? team, bool view = false)
        {
            if (IsAdmin || CanSeeAllSpecialities(team, view))
                return _allSpecialities ?? new();
            return Items(view)
                .Where(s => s.Team == team && s.Speciality != null)
                .Select(s => s.Speciality!)
                .Distinct()
                .OrderBy(s => (_allSpecialities ?? new()).IndexOf(s))
                .ToList();
        }

        // Ploegen waarvan de gebruiker deze specialiteit mag zien (teamkalender "Alle ploegen")
        public List<string> TeamsFor(string? speciality, bool view = false) => IsAdmin
            ? _allTeams ?? new()
            : TeamsOf(view).Where(t => Covers(t, speciality, view)).ToList();

        // "Alle specialiteiten" van een ploeg (teamkalender)
        public bool CanSeeAllSpecialities(string? team, bool view = false) =>
            IsAdmin || Items(view).Any(s => s.Team == team && s.Speciality == null);

        // Zelfde, maar enkel binnen de scopes: valt een (ploeg, specialiteit) eronder?
        public bool Covers(string? team, string? speciality, bool view = false) =>
            IsAdmin || Items(view).Any(s => s.Team == team && (s.Speciality == null || s.Speciality == speciality));

        // Geldige keuze na het wisselen van ploeg: huidige specialiteit behouden als dat mag, anders de eerste
        public string? FixSpeciality(string? team, string? speciality, bool allowAll = false, bool view = false)
        {
            if (allowAll && speciality == AllSpecialities && CanSeeAllSpecialities(team, view))
                return speciality;
            var options = SpecialitiesFor(team, view);
            return options.Contains(speciality ?? "") ? speciality : options.FirstOrDefault();
        }
    }
}
