using System;

namespace VerlofBWZC.DataContracts.DTO.Calendar
{
    public class AddMultipleDayOffsRequest
    {
        public int PersoonId { get; set; }
        public List<WorkDay> Days { get; set; } = new();
    }
}
