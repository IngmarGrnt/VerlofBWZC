using System;
using System.Text;
using VerlofBWZC.DataContracts.DTO;

namespace VerlofBWZC.DataContracts
{
    // Initialen van een persoon (teamkalender, kwartaalverlof, export).
    // Standaardregel op de achternaam: samengestelde naam = 2 letters van het eerste deel + 1 van het tweede
    // (De Leenheer -> DEL), anders de eerste 3 letters (Baute -> BAU). Per persoon aanpasbaar.
    public static class PersonInitials
    {
        public const int MaxLength = 10;

        public static string FromLastName(string? lastName)
        {
            var last = lastName?.Trim();
            if (string.IsNullOrWhiteSpace(last)) return "";

            var parts = last.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 2)
            {
                var initials = new StringBuilder();
                initials.Append(parts[0].Length >= 2 ? parts[0][..2] : parts[0]);
                initials.Append(parts[1][0]);
                return initials.ToString().ToUpperInvariant();
            }

            return (last.Length >= 3 ? last[..3] : last).ToUpperInvariant();
        }

        // Opgeslagen initialen, of anders de standaardregel
        public static string For(PersonBaseDTO? person) =>
            person == null ? "" : !string.IsNullOrWhiteSpace(person.Initials) ? person.Initials.Trim() : FromLastName(person.LastName);

        // Invoer opschonen: hoofdletters, geen spaties, max. lengte; leeg = standaardregel
        public static string Normalize(string? initials, string? lastName)
        {
            var value = (initials ?? "").Replace(" ", "").Trim().ToUpperInvariant();
            if (value.Length > MaxLength) value = value[..MaxLength];
            return value.Length > 0 ? value : FromLastName(lastName);
        }
    }
}
