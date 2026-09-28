using System;

namespace VerlofBWZC.DataContracts.DTO.Calendar
{
    // Status van een shift zonder verlof: rust (Ploeg0) of een andere afwezigheid/uurcode (Dispatching)
    public class RestShiftDTO
    {
        public int PersonId { get; set; }
        public DateTime Date { get; set; }
        public string Shift { get; set; } = "D";

        // null = rust (Ploeg0); anders een andere afwezigheid of uurcode (Werkregels.OtherAbsences)
        public string? Code { get; set; }
    }

    // Rust en codes van personen voor een jaar opslaan: vervangt ze in dat jaar (lege lijst = alles weg)
    public class SaveRestShiftsRequest
    {
        public int Year { get; set; }
        public List<PersonRestShifts> Persons { get; set; } = new();

        public class PersonRestShifts
        {
            public int PersonId { get; set; }
            public List<RestShiftDTO> Days { get; set; } = new();
        }
    }
}
