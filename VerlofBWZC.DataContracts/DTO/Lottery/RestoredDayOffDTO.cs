using System;

namespace VerlofBWZC.DataContracts.DTO.Lottery
{
    // Verlof dat teruggezet werd bij het verwijderen van een toegepaste loting
    public class RestoredDayOffDTO
    {
        public int PersonId { get; set; }
        public DateTime Date { get; set; }
        public string Shift { get; set; } = "";
        public int? LeaveCategoryId { get; set; }
    }
}
