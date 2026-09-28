using System;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.DataAccess.Entities
{
    // Extra shift: iemand werkt een dag- of nachtshift in een andere ploeg (bijspringen, geen verlof).
    // Telt als aanwezig in die ploeg: het verlofmaximum van die shift gaat met 1 omhoog (zie Werkregels).
    public class ExtraShift : BaseEntity
    {
        public int PersonId { get; set; }
        public DateTime Date { get; set; }
        public string Shift { get; set; } = "D";

        // Ploeg waarin de persoon die shift werkt
        public TeamName Team { get; set; }

        public string? Note { get; set; }
    }
}
