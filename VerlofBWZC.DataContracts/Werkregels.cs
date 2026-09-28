namespace VerlofBWZC.DataContracts
{
    // ============================================================================================
    // Werkregels: alle vaste regels over ploegen en specialiteiten op één plaats.
    // Gebruikt door de server (VerlofBWZC.Api) en de website (VerlofBWZC).
    // Overzicht in gewone taal: docs/regels.md. Deze regels zijn geen instelling in de app:
    // wijzigen gebeurt enkel hier in de code (door de beheerder/ontwikkelaar), gevolgd door een deploy.
    // ============================================================================================
    public static class Werkregels
    {
        // --- Ploeg zonder werkregime --------------------------------------------------------------

        // Deze ploeg werkt geen vast rooster (4 dagen: dag, nacht, 2 vrij) maar kan elke dag en nacht werken
        public const string NoRegimeTeam = "Ploeg0";

        public static bool HasNoRegime(string? team) => team == NoRegimeTeam;

        // "Per 2 shiften" (dagshift + nachtshift erna): controle op losse shiften en loting per paar.
        // Geldt niet voor de ploeg zonder werkregime.
        public static bool PairRulesApply(string? team) => !HasNoRegime(team);

        // Loting per shift in plaats van per paar
        public static bool LotteryPerShift(string? team) => HasNoRegime(team);

        // Telt deze ploeg mee voor de bezetting ("Bezet") van een andere ploeg die dezelfde shift werkt?
        // Nee voor de ploeg zonder werkregime (die telt enkel in haar eigen weergave; in de kolom "Totaal" telt ze mee als aanwezig)
        public static bool CountsForOtherTeamsOccupancy(string? team) => !HasNoRegime(team);

        // --- Weergave "Alle ploegen" in de teamkalender ------------------------------------------

        // Specialiteit waarvoor de teamkalender alle ploegen naast elkaar kan tonen
        public const string AllTeamsSpeciality = "Dispatching";

        // Minstens zoveel ploegen van die specialiteit moet de gebruiker mogen zien
        public const int MinTeamsForAllTeamsView = 2;

        public static bool AllowsAllTeamsView(string? speciality) => speciality == AllTeamsSpeciality;

        // --- Extra shift (bijspringen in een andere ploeg) ----------------------------------------

        // Enkel deze specialiteit kan een extra shift in een andere ploeg werken (aanduiden: manager/admin)
        public static bool AllowsExtraShifts(string? speciality) => speciality == AllTeamsSpeciality;

        // Een extra shift telt als aanwezig in de ploeg waar hij gewerkt wordt:
        // het verlofmaximum van die ploeg op die shift gaat met zoveel omhoog
        public const int ExtraShiftQuotaBonus = 1;

        // Mag iemand van deze ploeg een extra shift doen op een shift die zijn eigen ploeg werkt?
        // Nee (hij werkt dan al), behalve de ploeg zonder werkregime (die kan overal ingezet worden)
        public static bool ExtraShiftAllowedOnOwnShift(string? team) => HasNoRegime(team);

        // --- Standaardwaarden als er niets is ingesteld -----------------------------------------
        // (zie ook: PersonDefaults.LeaveAllowance = 44, QuarterLimitDTO 14/16/14, ShiftQuotaDTO.DefaultFor)

        // Maximum per shift zonder regel bij Max per shift: een kwart van de personen, minstens 1
        public static int DefaultShiftQuota(int members) => System.Math.Max(1, members / 4);
    }
}
