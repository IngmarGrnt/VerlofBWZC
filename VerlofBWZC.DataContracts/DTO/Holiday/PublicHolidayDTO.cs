using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using VerlofBWZC.DataContracts.DTO.Holiday;

namespace VerlofBWZC.DataContracts.DTO
{
    public class PublicHolidayDTO
    {
        public List<NameTranslationDTO> Name { get; set; }
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
        public string Type { get; set; }
    }
}