using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace VerlofBWZC.DataContracts.DTO.Lottery
{

    public class LotteryDrawDTO
    {
        public int DrawNumber { get; set; }
        public string DrawName { get; set; } = "";
        public DateTime FromDate { get; set; }
        public DateTime ToDate { get; set; }
        public string? Shift { get; set; } // "D" of "N" = enkel die shift; null = alle shiften in de periode
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

        public List<LotteryPersonDTO> Winners { get; set; } = new();
        public List<LotteryPersonDTO> Losers { get; set; } = new();
    }
}
