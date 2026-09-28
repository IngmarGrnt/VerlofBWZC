using System;

namespace VerlofBWZC.DataContracts.DTO.Calendar
{
    // Extra shift: iemand werkt een dag- of nachtshift in een andere ploeg (geen verlof)
    public class ExtraShiftDTO
    {
        public int Id { get; set; }
        public int PersonId { get; set; }
        public DateTime Date { get; set; }
        public string Shift { get; set; } = "D";

        // Ploeg waarin de persoon die shift werkt
        public string Team { get; set; } = string.Empty;
        public string? Note { get; set; }

        // Enkel om te tonen (antwoord van de server)
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? Initials { get; set; }
        public string? PersonTeam { get; set; }
        public string? PersonSpeciality { get; set; }
    }
}
