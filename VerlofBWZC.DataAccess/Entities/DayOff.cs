using System;
using VerlofBWZC.DataAccess.Enums;
using static VerlofBWZC.DataAccess.Entities.DayOff;

namespace VerlofBWZC.DataAccess.Entities
{
    public class DayOff:BaseEntity
    {
   
        public DateTime Date { get; set; }
        public int PersonId { get; set; }   
        public string Description { get; set; }
        public DayOffstatus Status { get; set; }
        public string? Shift { get; set; }


    }
}
