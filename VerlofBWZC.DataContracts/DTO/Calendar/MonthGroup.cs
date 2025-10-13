using System;

namespace VerlofBWZC.DataContracts.DTO.Calendar
{
    public class MonthGroup
    {
        public string MonthName { get; set; }
        public List<WorkDay> WorkDays { get; set; } = new();
    }
}
