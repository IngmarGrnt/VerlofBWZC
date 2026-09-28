# Regels van de verlofplanner

Dit is een overzicht van alle regels die gelden per ploeg en specialiteit: wat de regel doet, waar je hem eventueel instelt in de app, en waar hij in de code staat.

Er zijn twee soorten regels:

- **Vaste werkregels.** Deze staan in de code en zijn **geen instelling in de app**. Enkel de beheerder of ontwikkelaar kan ze wijzigen, in `VerlofBWZC.DataContracts/Werkregels.cs`. Daarna is een nieuwe deploy nodig.
- **Instelbare regels.** Deze stel je in via een menu in de app, afhankelijk van je rechten. Als er niets is ingesteld, geldt de standaardwaarde.

---

## 1. Vaste werkregels (enkel in de code, `Werkregels.cs`)

| Regel | Wat het doet | Code |
|---|---|---|
| **Ploeg0 heeft geen werkregime** | De andere ploegen werken een cyclus van 4 dagen: dag, nacht, 2 dagen vrij. Ploeg0 kan elke dag en elke nacht werken. | `Werkregels.NoRegimeTeam`, `HasNoRegime`; gebruikt in `VerlofBWZC.Api/Helpers/CalenderHelper.cs` |
| **Per 2 shiften (paar)** | Verlof wordt normaal per paar genomen: een dagshift en de nachtshift erna. Een losse shift toont een waarschuwing. **Geldt niet voor Ploeg0.** | `Werkregels.PairRulesApply`; gebruikt in `WorkCalendar.razor` en `TeamCalendar.razor` |
| **Andere afwezigheden en uren verlof (Dispatching)** | Via "Aanduiden als → Andere…" kies je per shift een code in een popup. Afwezig: AOV (aanvraag onbetaald verlof), OV (onbetaald verlof), ZK (ziek), OUD (ouderschapsverlof), O1 (omstandigheidsverlof), DV (dienstvrijstelling), APL (andere ploeg/plaats), AFL (afgelost). Uren verlof: 3U/, 6U/, 9U/ (eerste 3, 6, 9 uur) en /3U, /6U, /9U (laatste 3, 6, 9 uur). Geen verlof: telt niet mee in x/44, de kolom Verlof of de loting. Een afwezigheid telt niet als aanwezig in Totaal; een uurcode wel (enkel info). Eén code of rust per shift, en niet samen met verlof. | `Werkregels.OtherAbsences`, `AllowsOtherAbsences`; `RestShiftController.cs`, `TeamCalendar.razor`, `OtherAbsenceDialog.razor` |
| **Rust voor Ploeg0** | Ploeg0 heeft geen rooster. Een verantwoordelijke duidt in de teamkalender (Aanduiden als → Rust) de shiften aan waarop iemand van Ploeg0 niet werkt. Rust is geen verlof: het telt niet mee in x/44, de kolom Verlof of de loting. Wie rust heeft, telt niet als aanwezig in Totaal. Rust en verlof op dezelfde shift kan niet. | `Werkregels.AllowsRestShifts`; `RestShiftController.cs`, `TeamCalendar.razor`, `WorkCalendar.razor` |
| **Loting per paar of per shift** | Een loting gebeurt standaard per paar (D+N). Voor Ploeg0 gebeurt ze per shift. | `Werkregels.LotteryPerShift`; gebruikt in `TeamCalendar.razor` en `RandomNamePicker.razor` |
| **Verlof van Ploeg0 telt niet mee voor andere ploegen** | Het verlof van Ploeg0 telt niet mee in de kolom "Verlof" en in het maximum van een andere ploeg die dezelfde shift werkt. De kolom **Totaal** toont wie die shift werkt (ploeg van dienst, Ploeg0 en extra shiften, zonder verlof) tegenover het minimum: de personen van de ploeg van dienst min het verlofmaximum. Gelijk of erboven is ok, eronder rood. | `Werkregels.CountsForOtherTeamsOccupancy`; gebruikt in `TeamCalendar.razor` |
| **"Alle ploegen" enkel voor Dispatching** | In de teamkalender kan de keuze "Alle ploegen" alle ploegen naast elkaar tonen. Dit kan enkel voor de specialiteit Dispatching, en enkel als je minstens 2 ploegen van Dispatching mag zien. | `Werkregels.AllTeamsSpeciality`, `MinTeamsForAllTeamsView`, `AllowsAllTeamsView` |
| **Standaard max per shift** | Als er geen regel is bij *Max per shift*, is het maximum een kwart van de personen, met minstens 1. | `Werkregels.DefaultShiftQuota` (via `ShiftQuotaDTO.DefaultFor`) |
| **Manager van Dispatching telt niet mee** | Een persoon met rol Manager en specialiteit Dispatching staat in de kalender en kan verlof nemen, maar telt niet mee in de bezetting: niet in de kolom "Verlof", niet in het aantal personen voor het maximum of het minimum aanwezig, en niet in de loting. | `Werkregels.CountsAsStaff`; gebruikt in `TeamCalendar.razor` en `RandomNamePicker.razor` |
| **Extra shift enkel voor Dispatching** | Iemand van Dispatching kan een dag- of nachtshift in een andere ploeg werken. Een extra shift is geen verlof: hij telt niet mee in x/44, de kwartaalmaxima of de loting. Hij kan niet in de eigen ploeg, en niet op een shift die de eigen ploeg werkt (behalve voor Ploeg0). | `Werkregels.AllowsExtraShifts`, `ExtraShiftAllowedOnOwnShift`; `ExtraShiftController.cs` |
| **Extra shift verhoogt het maximum** | Elke extra shift in een ploeg verhoogt het verlofmaximum van die ploeg op die shift met 1. | `Werkregels.ExtraShiftQuotaBonus`; gebruikt in `TeamCalendar.razor` |

Een nieuwe uitzondering toevoegen, zoals een tweede ploeg zonder werkregime, kan in `Werkregels.cs`. Alle schermen en de server volgen dan automatisch.

## 2. Andere vaste standaarden (in de code)

| Regel | Waarde | Code |
|---|---|---|
| Verlofshiften per persoon per jaar | 44, per persoon aanpasbaar bij *Personen* | `VerlofBWZC.DataContracts/PersonDefaults.cs` |
| Kwartaalmaxima als er niets is ingesteld | Q1 14, Q2 16, Q3 14 | `VerlofBWZC.DataContracts/DTO/Leave/QuarterLimitDTO.cs` |
| Wachtwoord | Minstens 8 tekens, geen veelgebruikt wachtwoord, niet je naam of e-mail | `VerlofBWZC.DataContracts/PasswordPolicy.cs` |
| Registratie | Enkel adressen op `@bwzc.be`. Nieuwe accounts komen in Ploeg1 met rol User en 44 shiften, en moeten eerst goedgekeurd worden. | `VerlofBWZC.DataContracts/DTO/RegisterDTO.cs`, `PersonController.Register` |
| Rooster | Dagshift op dag X, nachtshift op X+1, cyclus van 4 dagen vanaf de startdatum van de ploeg | `VerlofBWZC.Api/Helpers/CalenderHelper.cs` |

## 3. Instelbare regels (in de app)

| Regel | Menu | Wie |
|---|---|---|
| Verlofcategorieën: kleur, code, en of de shiften "aansluitend" moeten zijn | Verlofregels → **Verlofcategorieën** | Admin of manager |
| Kwartaalmaxima per ploeg en specialiteit | Verlofregels → **Kwartaalmaxima** | Admin, of een manager voor zijn eigen ploegen en specialiteiten |
| Max per shift per ploeg, specialiteit en eventueel jaar (dag en nacht samen of apart) | Verlofregels → **Max per shift** | Admin, of een manager voor zijn eigen ploegen en specialiteiten |
| Wie mag de teamkalender bewerken of loten | Beheer → **Manager Paneel** | Admin of manager |
| Extra ploegen en specialiteiten van een manager | Beheer → **Personen** (oranje knop naast "Manager") | Admin |
| Registraties goedkeuren of weigeren | Beheer → **Personen** | Admin of manager |
| Extra shift aanduiden of verwijderen (Dispatching) | Teamkalender → knop **Extra shift**, of de paarse **+1** naast Verlof | Admin, of een manager die beide ploegen beheert en de teamkalender mag opslaan (Manager Paneel) |

## 4. Rechten (rollen)

- **User** ziet de eigen ploeg en specialiteit.
- **Manager** ziet en beheert de eigen ploeg en specialiteit, plus de extra ploegen en specialiteiten die bij *Personen* zijn toegewezen. Of hij in de teamkalender mag opslaan of loten, hangt af van het Manager Paneel.
- **Admin** mag alles, en heeft als enige de demomodus.

In de code: `VerlofBWZC.Api/Services/UserContext.cs` (scopes) en `CalendarAccessService.cs` (Manager Paneel).
