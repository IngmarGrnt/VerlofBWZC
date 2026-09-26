using System;

namespace VerlofBWZC.DataContracts.DTO.Calendar
{
    public class WorkDay
    {
        public DateTime Date { get; set; }
        public string Shift { get; set; }

        // Verlofcategorie van deze verlofshift (null = gewoon verlof)
        public int? LeaveCategoryId { get; set; }
    }
}
