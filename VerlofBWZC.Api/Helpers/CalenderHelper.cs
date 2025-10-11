using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataContracts.DTO;


namespace VerlofBWZC.Api.Helpers
{
    public class CalendarHelper
    {
        public class WorkDay
        {
            public DateTime Date { get; set; }
            public string Shift { get; set; } // "Day" of "Night"
        }
        public List<WorkDay> GenerateWorkCalendar(Team team, int year)
        {
            var calendar = new List<WorkDay>();
            var start = new DateTime(year, 1, 1);
            var end = new DateTime(year, 12, 31);

            // Bepaal de offset vanaf het team startmoment
            int offset = (int)(start - team.StartDate).TotalDays % 4;
            if (offset < 0) offset += 4;

            var current = start.AddDays(-offset);
            while (current <= end)
            {
                // 2 werkdagen: dag en nacht
                for (int i = 0; i < 2; i++)
                {
                    var day = current.AddDays(i);
                    if (day.Year != year) continue;

                    calendar.Add(new WorkDay
                    {
                        Date = day,
                        Shift = i == 0 ? "D" : "N"
                    });
                }
                // Sla de 2 "Off" dagen over
                current = current.AddDays(4);
            }
            return calendar;
        }
    }
}
