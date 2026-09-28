using System;

namespace VerlofBWZC.DataAccess.Entities
{
    // Rust: een shift waarop iemand zonder vast werkregime (Ploeg0) niet werkt.
    // Geen verlof (telt niet mee in het verlofaantal, Bezet of de loting), maar hij is dan niet aanwezig.
    public class RestShift : BaseEntity
    {
        public int PersonId { get; set; }
        public DateTime Date { get; set; }
        public string Shift { get; set; } = "D";
    }
}
