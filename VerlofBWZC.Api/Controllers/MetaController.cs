using Microsoft.AspNetCore.Mvc;
using VerlofBWZC.DataAccess;
using VerlofBWZC.DataAccess.Enums;

namespace VerlofBWZC.Api.Controllers
{
    [ApiController]
    [Route("api/meta")]
    public class MetaController : ControllerBase
    {
        [HttpGet("teams")]
        public ActionResult<IEnumerable<string>> GetTeams()
            => Ok(Enum.GetNames(typeof(TeamName)));

        [HttpGet("specialities")]
        public ActionResult<IEnumerable<string>> GetSpecialities()
            => Ok(Enum.GetNames(typeof(Speciality)));

        [HttpGet("grades")]
        public ActionResult<IEnumerable<string>> GetGrades()
           => Ok(Enum.GetNames(typeof(Grade)));

        [HttpGet("roles")]
        public ActionResult<IEnumerable<string>> GetRoles()
            => Ok(Enum.GetNames(typeof(Role)));

    }

}
