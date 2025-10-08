using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Data.Common;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using VerlofBWZC.DataAccess.Entities;
using VerlofBWZC.DataAccess.Repositories.Interfaces;

namespace VerlofBWZC.DataAccess.Repositories
{
    public class GenericRepo<Entity> : IGenericRepo<Entity> where Entity : BaseEntity
    {

        internal readonly VerlofBWZC_DbContext _dbcontext;
        internal readonly DbSet<Entity> _dbSet;
        public GenericRepo(VerlofBWZC_DbContext dbcontext)
        {
            _dbcontext = dbcontext;
            _dbSet = dbcontext.Set<Entity>();
        }
        public int Add(Entity entity)
        {
            try
            {
                _dbSet.Add(entity);
                SaveChanges();
                return entity.Id;
            }
            catch (DbException ex)
            {
                throw new Exception(ex.Message + "Database error when adding data.");
            }
            catch (Exception ex)
            {
                throw new Exception(ex.Message + "Database error when adding data.");
            }

        }

        public void Delete(int id)
        {
            try
            {
                _dbSet.Where(x => x.Id == id).ExecuteDelete();
            }
            catch (DbException ex)
            {

                throw new Exception(ex.Message + "Error deleting the data from the database.");
            }
            catch (Exception ex)
            {

                throw new Exception(ex.Message + "Error deleting the data from the database.");
            }
        }

        public virtual List<Entity> GetAll()
        {
            try
            {
                return _dbSet.ToList();
            }
            catch (DbException ex)
            {
                throw new Exception(ex.Message + $"Error retrieving the data from the database for GetAll.");
            }
            catch (Exception ex)
            {

                throw new Exception(ex.Message + $"Error retrieving the data from the database for GetAll.");
            }
        }

        public virtual Entity GetById(int id)
        {
            try
            {
                return _dbSet.FirstOrDefault(db => db.Id == id);
            }
            catch (DbException ex)
            {
                throw new Exception(ex.Message + "Error retrieving the data from the database for GetById.");
            }
            catch (Exception ex)
            {

                throw new Exception(ex.Message + "Error retrieving the data from the database for GetById.");
            }
        }

        public void SaveChanges()
        {

            try
            {
                _dbcontext.SaveChanges();
            }
            catch (DbException ex)
            {

                throw new Exception(ex.Message + "Database error when saving data.");
            }
            catch (Exception ex)
            {

                throw new Exception(ex.Message + "Database error when saving data.");
            }
        }

        public void Update(Entity entity)
        {
            try
            {
                _dbSet.Update(entity);
                SaveChanges();
            }
            catch (DbException ex)
            {
                throw new Exception(ex.Message + "Database error when updating data.");
            }
            catch (Exception ex)
            {
                throw new Exception(ex.Message + "Database error when updating data.");
            }

        }
    }
}
