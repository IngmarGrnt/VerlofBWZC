using System;

namespace VerlofBWZC.DataContracts.DTO.Access
{
    public record CalendarPermissionsDTO(
        bool CanSeeTeamCalendar,
        bool CanSaveWorkCalendar,
        bool CanSaveTeamCalendar
    );
}
