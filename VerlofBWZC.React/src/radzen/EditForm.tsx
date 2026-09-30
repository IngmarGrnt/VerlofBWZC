import { createContext, useCallback, useContext, useRef, useState, type FormEvent, type ReactNode } from 'react'

// Zoals Blazor's <EditForm> zonder validator: een <form> die bij verzenden OnValidSubmit oproept.
// De velden krijgen dezelfde klassen als bij Blazor: "valid", na een wijziging "modified valid"
// (app.css toont dan een groene rand rond het veld).

interface EditContextValue {
  fieldClass(name: string | undefined): string | undefined
  notifyChanged(name: string | undefined): void
}

const EditContext = createContext<EditContextValue | null>(null)

export function useFieldClass(name: string | undefined) {
  const ctx = useContext(EditContext)
  return {
    fieldClass: ctx?.fieldClass(name),
    notifyChanged: () => ctx?.notifyChanged(name),
  }
}

export function EditForm({ onValidSubmit, children }: { onValidSubmit: () => void | Promise<void>; children: ReactNode }) {
  const modified = useRef(new Set<string>())
  const [, setVersion] = useState(0)

  const fieldClass = useCallback((name: string | undefined) => {
    if (name === undefined) return undefined
    return modified.current.has(name) ? 'modified valid' : 'valid'
  }, [])

  const notifyChanged = useCallback((name: string | undefined) => {
    if (name === undefined || modified.current.has(name)) return
    modified.current.add(name)
    setVersion(v => v + 1)
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    void onValidSubmit()
  }

  return (
    <EditContext.Provider value={{ fieldClass, notifyChanged }}>
      <form onSubmit={submit}>{children}</form>
    </EditContext.Provider>
  )
}
