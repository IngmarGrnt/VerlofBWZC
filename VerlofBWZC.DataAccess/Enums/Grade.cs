using System;
using VerlofBWZC.DataAccess.Entities;

namespace VerlofBWZC.DataAccess.Enums
{
    public enum Grade
    {
        Brandweerman,
        Korporaal,
        Sergeant,
        Adjudant,
        Luitenant,
        Kapitein,
        Majoor,
        Kolonel,
        // Nieuwe graden altijd achteraan toevoegen: de databank bewaart de positie (0 = Brandweerman, ...)
        Administratie
    }
}
