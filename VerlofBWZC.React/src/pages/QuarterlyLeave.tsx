import { useEffect, useState } from 'react'
import { DropDown } from '../radzen/DropDown'
import { getJson } from '../api/http'
import type { PersonBaseDTO } from '../api/person'
import { scopeService } from '../services/scope'
import { getCurrentPerson } from '../services/browser'
import { parseDate } from '../util/dotnet'
import { initialsFor } from '../rules'

// Zelfde als VerlofBWZC/Pages/QuarterlyLeave.razor (@page "/Quarterlyleave", [Authorize])

interface TeamDayOffDTO {
  personId: number
  date: string
  shift: string
}

interface PersonQuarterCountsDto {
  personId: number
  name: string
  q1: number
  q2: number
  q3: number
}

const thisYear = new Date().getFullYear()
const years = Array.from({ length: 5 }, (_, i) => thisYear - 1 + i)

// Aantal shiften met 1, 2, ... 8 personen in verlof (en meer dan 8 bij de laatste, als dat voorkomt)
function bucketsOf(shiftCounts: number[]): [string, number][] {
  const result: [string, number][] = []
  for (let n = 1; n <= 8; n++) result.push([String(n), shiftCounts.filter(c => c === n).length])
  const more = shiftCounts.filter(c => c > 8).length
  if (more > 0) result.push(['9+', more])
  return result
}

export function QuarterlyLeave() {
  const [selectedYear, setSelectedYear] = useState(thisYear + 1)
  const [teamMembers, setTeamMembers] = useState<PersonBaseDTO[]>([])
  const [personQuarterCounts, setPersonQuarterCounts] = useState<PersonQuarterCountsDto[] | null>(null)
  const [shiftCounts, setShiftCounts] = useState<number[]>([])
  // Totaal aantal verlofshiften
  const [shiftsCount, setShiftsCount] = useState(0)
  const [hasChoice, setHasChoice] = useState(() => scopeService.hasChoice)
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null)
  const [selectedSpeciality, setSelectedSpeciality] = useState<string | null>(null)
  const [teamOptions, setTeamOptions] = useState<string[]>([])
  const [specialityOptions, setSpecialityOptions] = useState<string[]>([])

  const loadQuarterlyData = async (teamName: string | null, speciality: string | null, year: number) => {
    setPersonQuarterCounts(null)

    const members = (await getJson<PersonBaseDTO[] | null>(`api/person/team/${teamName ?? ''}/${speciality ?? ''}`)) ?? []
    setTeamMembers(members)

    const daysOff = ((await getJson<TeamDayOffDTO[] | null>(`api/person/team-days-off/${teamName ?? ''}/${year}/${speciality ?? ''}`)) ?? []).map(d => ({
      ...d,
      day: parseDate(d.date),
    }))

    // Per persoon de aantallen per kwartaal (KW1 = jan-apr, KW2 = mei-aug, KW3 = sep-dec)
    const count = (id: number, from: number, to: number) =>
      daysOff.filter(d => d.personId === id && d.day.getFullYear() === year && d.day.getMonth() + 1 >= from && d.day.getMonth() + 1 <= to).length
    const counts = members
      .map(m => ({
        personId: m.id,
        name: !m.firstName?.trim() ? m.lastName : `${m.firstName} ${m.lastName}`,
        q1: count(m.id, 1, 4),
        q2: count(m.id, 5, 8),
        q3: count(m.id, 9, 12),
      }))
      .sort((a, b) => b.q1 + b.q2 + b.q3 - (a.q1 + a.q2 + a.q3))

    // Per shift (datum + shift) het aantal personen in verlof
    const groups = new Map<string, Set<number>>()
    for (const d of daysOff) {
      if (d.day.getFullYear() !== year) continue
      const key = `${d.day.getFullYear()}-${d.day.getMonth()}-${d.day.getDate()}|${d.shift}`
      if (!groups.has(key)) groups.set(key, new Set())
      groups.get(key)!.add(d.personId)
    }
    const perShift = [...groups.values()].map(s => s.size)

    setPersonQuarterCounts(counts)
    setShiftCounts(perShift)
    setShiftsCount(perShift.reduce((a, b) => a + b, 0))
  }

  useEffect(() => {
    void (async () => {
      // Standaard de eigen ploeg en specialiteit (in demo modus de gekozen waarden)
      const person = await getCurrentPerson()
      let team = person?.team ?? null
      let speciality = person?.speciality ?? null
      setSelectedTeam(team)
      setSelectedSpeciality(speciality)

      // Admin: alle ploegen; Manager: de ploegen en specialiteiten die hij beheert
      await scopeService.load(true)
      setHasChoice(scopeService.hasChoice)
      if (scopeService.hasChoice) {
        const options = scopeService.teams
        setTeamOptions(options)
        if (!options.includes(team ?? '')) team = options[0] ?? null
        speciality = scopeService.fixSpeciality(team, speciality)
        setSelectedTeam(team)
        setSelectedSpeciality(speciality)
        setSpecialityOptions(scopeService.specialitiesFor(team))
      }

      await loadQuarterlyData(team, speciality, selectedYear)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const changeYear = async (delta: number) => {
    const year = selectedYear + delta
    if (year < Math.min(...years) || year > Math.max(...years)) return
    setSelectedYear(year)
    await loadQuarterlyData(selectedTeam, selectedSpeciality, year)
  }

  const changeTeam = async (team: string | null) => {
    setSelectedTeam(team)
    const speciality = scopeService.fixSpeciality(team, selectedSpeciality)
    setSelectedSpeciality(speciality)
    setSpecialityOptions(scopeService.specialitiesFor(team))
    await loadQuarterlyData(team, speciality, selectedYear)
  }

  const changeSpeciality = async (speciality: string | null) => {
    setSelectedSpeciality(speciality)
    await loadQuarterlyData(selectedTeam, speciality, selectedYear)
  }

  return (
    <>
      {/* Kop: titel, jaar, ploeg/specialiteit */}
      <div className="wc-header">
        <div className="wc-title">
          <h1>Kwartaalverlof</h1>{' '}
          <div className="wc-year" role="group" aria-label="Jaar kiezen">
            <button type="button" className="wc-year-btn" aria-label="Vorig jaar" disabled={selectedYear <= Math.min(...years)} onClick={() => changeYear(-1)}>
              <i className="rzi">chevron_left</i>
            </button>{' '}
            <span className="wc-year-label">{selectedYear}</span>{' '}
            <button type="button" className="wc-year-btn" aria-label="Volgend jaar" disabled={selectedYear >= Math.max(...years)} onClick={() => changeYear(1)}>
              <i className="rzi">chevron_right</i>
            </button>
          </div>
        </div>
        {hasChoice ? (
          // Admin: elke ploeg en specialiteit; Manager: wat hij beheert; anderen hun eigen ploeg
          <div className="ql-scope">
            <DropDown data={teamOptions} value={selectedTeam} onChange={changeTeam} placeholder="Ploeg" className="ql-filter" />{' '}
            <DropDown data={specialityOptions} value={selectedSpeciality} onChange={changeSpeciality} placeholder="Specialiteit" className="ql-filter" />
          </div>
        ) : (
          <span className="tc-scope">
            {selectedTeam} · {selectedSpeciality}
          </span>
        )}
      </div>

      {/* Samenvatting: hoeveel shiften hebben 1, 2, ... personen in verlof */}
      <div className="ql-summary">
        <div className="ql-summary-title">
          Shiften met … personen in verlof <span className="ql-total">· totaal {shiftsCount} verlofshiften</span>
        </div>
        <div className="ql-buckets">
          {bucketsOf(shiftCounts).map(([n, count]) => (
            <span
              key={n}
              className={count > 0 ? 'ql-bucket' : 'ql-bucket ql-bucket-zero'}
              title={`${count} shift(en) met ${n} ${n === '1' ? 'persoon' : 'personen'} in verlof`}
            >
              <span className="ql-bucket-n">{n}</span>{' '}
              <span className="ql-bucket-count">{count}</span>
            </span>
          ))}
        </div>
      </div>

      {personQuarterCounts === null ? (
        <p className="wc-loading">Kwartaalverlof laden…</p>
      ) : personQuarterCounts.length === 0 ? (
        <p className="wc-loading">Geen personen in deze ploeg en specialiteit.</p>
      ) : (
        // Per persoon: KW1 jan-apr, KW2 mei-aug, KW3 sep-dec
        <div className="ql-list">
          <div className="ql-row ql-head" aria-hidden="true">
            <span className="ql-name">Naam</span>{' '}
            <span className="ql-q">
              KW1<small>jan–apr</small>
            </span>{' '}
            <span className="ql-q">
              KW2<small>mei–aug</small>
            </span>{' '}
            <span className="ql-q">
              KW3<small>sep–dec</small>
            </span>{' '}
            <span className="ql-q">Totaal</span>
          </div>
          {personQuarterCounts.map(p => {
            const person = teamMembers.find(m => m.id === p.personId)
            return (
              <div key={p.personId} className="ql-row">
                <span className="ql-name">
                  <span className="ql-initials">{initialsFor(person)}</span>{' '}
                  <span className="ql-fullname">{p.name}</span>
                </span>{' '}
                <span className="ql-q" data-label="KW1">
                  {p.q1}
                </span>{' '}
                <span className="ql-q" data-label="KW2">
                  {p.q2}
                </span>{' '}
                <span className="ql-q" data-label="KW3">
                  {p.q3}
                </span>{' '}
                <span className="ql-q ql-q-total" data-label="Totaal">
                  {p.q1 + p.q2 + p.q3}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
