using System.Collections.Generic;

namespace VerlofBWZC.DataContracts.DTO.Access
{
    // Een ploeg met een specialiteit; Speciality null = alle specialiteiten van die ploeg
    public class ScopeItemDTO
    {
        public string Team { get; set; } = "";
        public string? Speciality { get; set; }
    }

    // Wat de ingelogde gebruiker mag zien/beheren (voor de keuzelijsten in de schermen)
    public class MyScopeDTO
    {
        public bool IsAdmin { get; set; }
        public List<ScopeItemDTO> Scopes { get; set; } = new();
    }

    // Beheerde ploegen van een manager (Admin, Personen)
    public class ManagerScopesDTO
    {
        public int PersonId { get; set; }
        public List<ScopeItemDTO> Scopes { get; set; } = new();
    }
}
