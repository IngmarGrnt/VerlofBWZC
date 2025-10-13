using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;


namespace VerlofBWZC.DataContracts.DTO.Holiday
{
    public class SchoolHolidayDTO
    {
        public List<NameTranslationDTO> Name { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string Type { get; set; }
        public List<SubdivisionDTO> Subdivisions { get; set; }
    }

}
