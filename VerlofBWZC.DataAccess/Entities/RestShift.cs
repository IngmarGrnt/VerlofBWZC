using System;

namespace VerlofBWZC.DataAccess.Entities
{
    // Status van een shift zonder verlof (één per persoon, datum en shift):
    // - Code null = rust: iemand zonder vast werkregime (Ploeg0) werkt die shift niet.
    // - Code gezet = andere afwezigheid of uurcode (Dispatching), bv. ZK of 3U/ (zie Werkregels.OtherAbsences).
    // Geen verlof: telt niet mee in het verlofaantal, de kolom Verlof of de loting.
    public class RestShift : BaseEntity
    {
        public int PersonId { get; set; }
        public DateTime Date { get; set; }
        public string Shift { get; set; } = "D";
        public string? Code { get; set; }
    }
}
