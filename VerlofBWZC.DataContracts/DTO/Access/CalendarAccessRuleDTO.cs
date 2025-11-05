using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VerlofBWZC.DataContracts.DTO.Access
{

    public class CalendarAccessRuleDTO
    {
        public int Id { get; set; }
        public string Team { get; set; } = string.Empty;        // e.g. "Ploeg1"
        public string Speciality { get; set; } = string.Empty;  // e.g. "ICU"
        public int? Year { get; set; }
        public bool CanSeeTeamCalendar { get; set; }
        public bool CanSaveWorkCalendar { get; set; }
        public bool CanSaveTeamCalendar { get; set; }
    }
}
