using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VerlofBWZC.DTO.DTO.Holidays
{

    public class PublicHolidayDTO
    {
        public List<NameTranslationDTO> Name { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string Type { get; set; }
    }
}
