using System;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.DataAccess.Entities
{
    public class CalendarAccessRule : BaseEntity
    {
        public TeamName Team { get; set; }
        public Speciality Speciality { get; set; }

        // Null => applies to all years (acts as default). Specific year overrides default.
        public int? Year { get; set; }

        public bool CanSeeTeamCalendar { get; set; }
        public bool CanSaveWorkCalendar { get; set; }
        public bool CanSaveTeamCalendar { get; set; }

        // Enkel Dispatching (Werkregels.AllowsAllTeamsView): personen van deze ploeg mogen de teamkalender van
        // alle ploegen van die specialiteit bekijken (enkel lezen). Standaard aan.
        public bool CanSeeAllTeams { get; set; } = true;
    }
}
