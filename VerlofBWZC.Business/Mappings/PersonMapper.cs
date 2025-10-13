using AutoMapper;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataContracts.DTO; 

namespace VerlofBWZC.Business.Mappings
{
    public class PersonMapper:Profile
    {
        public PersonMapper()
        {
            CreateMap<Person, PersonBaseDTO>();
            CreateMap<PersonBaseDTO, Person>();
            CreateMap<Person, PersonCreateDTO>();
            CreateMap<PersonCreateDTO, Person>(); 
    
        }
    }
}
