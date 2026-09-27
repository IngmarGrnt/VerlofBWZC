using System.Net.Http.Json;
using VerlofBWZC.DataContracts.DTO.Access;

namespace VerlofBWZC.Services
{
    // Welke ploegen en specialiteiten de ingelogde gebruiker mag kiezen in de schermen.
    // Admin: alles. Manager: zijn eigen ploeg + specialiteit en wat de Admin hem gaf. Anderen: enkel de eigen.
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

        // Meer dan één keuze: dan tonen de schermen keuzelijsten
        public bool HasChoice => IsAdmin || (_scope?.Scopes.Count ?? 0) > 1 || (_scope?.Scopes.Any(s => s.Speciality == null) ?? false);

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

        public List<string> Teams => IsAdmin
            ? _allTeams ?? new()
            : (_scope?.Scopes.Select(s => s.Team).Distinct().OrderBy(t => (_allTeams ?? new()).IndexOf(t)).ToList() ?? new());

        public List<string> AllSpecialityNames => _allSpecialities ?? new();

        // Specialiteiten die binnen een ploeg gekozen mogen worden
        public List<string> SpecialitiesFor(string? team)
        {
            if (IsAdmin || CanSeeAllSpecialities(team))
                return _allSpecialities ?? new();
            return _scope?.Scopes
                .Where(s => s.Team == team && s.Speciality != null)
                .Select(s => s.Speciality!)
                .Distinct()
                .OrderBy(s => (_allSpecialities ?? new()).IndexOf(s))
                .ToList() ?? new();
        }

        // Ploegen waarvan de gebruiker deze specialiteit mag zien (teamkalender "Alle ploegen")
        public List<string> TeamsFor(string? speciality) => IsAdmin
            ? _allTeams ?? new()
            : Teams.Where(t => Covers(t, speciality)).ToList();

        // "Alle specialiteiten" van een ploeg (teamkalender)
        public bool CanSeeAllSpecialities(string? team) =>
            IsAdmin || (_scope?.Scopes.Any(s => s.Team == team && s.Speciality == null) ?? false);

        // Zelfde, maar enkel binnen de scopes: valt een (ploeg, specialiteit) eronder?
        public bool Covers(string? team, string? speciality) =>
            IsAdmin || (_scope?.Scopes.Any(s => s.Team == team && (s.Speciality == null || s.Speciality == speciality)) ?? false);

        // Geldige keuze na het wisselen van ploeg: huidige specialiteit behouden als dat mag, anders de eerste
        public string? FixSpeciality(string? team, string? speciality, bool allowAll = false)
        {
            if (allowAll && speciality == AllSpecialities && CanSeeAllSpecialities(team))
                return speciality;
            var options = SpecialitiesFor(team);
            return options.Contains(speciality ?? "") ? speciality : options.FirstOrDefault();
        }
    }
}
