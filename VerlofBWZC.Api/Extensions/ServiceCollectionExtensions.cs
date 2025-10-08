using Microsoft.EntityFrameworkCore;
using VerlofBWZC.Business.Mappings;

namespace VerlofBWZC.Api.Extensions
{
    public static class ServiceCollectionExtensions
    {

        // Methode voor DbContext
        public static IServiceCollection AddDbContextOptions(this IServiceCollection services, ConfigurationManager configuration)
        {
            services.AddDbContext<VerlofBWZC_DbContext>(options =>
                options.UseSqlServer(configuration.GetConnectionString("DefaultConnection")));
            return services;

        }

        // Methode voor AutoMapper-configuratie
        public static IServiceCollection AddAutoMapperConfiguration(this IServiceCollection services)
        {
            services.AddAutoMapper(cfg =>
            {
                cfg.AddProfile<PersonMapper>();
                //cfg.AddProfile<DayOffMapper>();
                //cfg.AddProfile<TeamMapper>();
            });

            return services;
        }
    }
}
