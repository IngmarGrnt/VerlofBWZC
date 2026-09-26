using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VerlofBWZC.DataContracts.DTO.Lottery
{
    public class LotteryPersonDTO
    {
        public int PersonId { get; set; }
        public string FirstName { get; set; } = "";
        public string LastName { get; set; } = "";

        // Enkel verliezers: bij toepassen weggehaald verlof (terugzetten bij verwijderen van de loting)
        public bool RemovedDay { get; set; }
        public bool RemovedNight { get; set; }
        public int? DayLeaveCategoryId { get; set; }
        public int? NightLeaveCategoryId { get; set; }
    }

}
