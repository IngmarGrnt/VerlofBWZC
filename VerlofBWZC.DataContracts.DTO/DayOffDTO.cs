using VerlofBWZC.DataAccess.Enums;
using System;

namespace VerlofBWZC.DataContracts.DTO
{
    public class DayOffDTO
    {
        public DateTime Date { get; set; }
        public string? Description { get; set; }
        public DayOffstatus Status { get; set; }
    }
}