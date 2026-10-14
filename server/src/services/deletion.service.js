import mongoose from 'mongoose';
import { Company } from '../models/company.model.js';
import { User, userModel } from '../models/user.model.js';
import { Department } from '../models/department.model.js';
import { Announcement } from '../models/announcement.model.js';
import { ChecklistTemplate, Checklist } from '../models/checklist.model.js';
import { Session } from '../models/session.model.js';
import { ServiceError } from './company.service.js';
import { runAsTenant } from '../utils/tenantContext.js';

// Carries out an approved delete request, inside the requesting company's scope.
// Each entry returns a label for the audit log and throws ServiceError when the target can no longer be deleted.
const valid = (id) => mongoose.isValidObjectId(id);

const EXECUTORS = {
  async user(id) {
    const user = valid(id) ? await userModel.findById(id) : null;
    if (!user) throw new ServiceError(404, 'That employee no longer exists.');
    await userModel.remove(user.id);
    return user.email;
  },
  async department(id) {
    const department = valid(id) ? await Department.findById(id) : null;
    if (!department) throw new ServiceError(404, 'That department no longer exists.');
    const members = await User.countDocuments({ department: department.name });
    if (members > 0) throw new ServiceError(409, `${members} employee(s) still belong to this department. Move them first.`);
    await department.deleteOne();
    return department.name;
  },
  async announcement(id) {
    const announcement = valid(id) ? await Announcement.findById(id) : null;
    if (!announcement) throw new ServiceError(404, 'That announcement no longer exists.');
    await announcement.deleteOne();
    return announcement.title;
  },
  async checklistTemplate(id) {
    const result = valid(id) ? await ChecklistTemplate.deleteOne({ _id: id }) : { deletedCount: 0 };
    if (!result.deletedCount) throw new ServiceError(404, 'That template no longer exists.');
    return 'checklist template';
  },
  async checklist(id) {
    const result = valid(id) ? await Checklist.deleteOne({ _id: id }) : { deletedCount: 0 };
    if (!result.deletedCount) throw new ServiceError(404, 'That checklist no longer exists.');
    return 'checklist';
  }
};

export const describeTarget = async (targetType, id) => {
  if (!valid(id)) return null;
  switch (targetType) {
    case 'user': return (await userModel.findById(id))?.email ?? null;
    case 'department': return (await Department.findById(id))?.name ?? null;
    case 'announcement': return (await Announcement.findById(id))?.title ?? null;
    case 'checklistTemplate': return (await ChecklistTemplate.findById(id))?.name ?? null;
    case 'checklist': return (await Checklist.findById(id))?.title ?? null;
    default: return null;
  }
};

// Deleting a company closes it for good: the workspace stops resolving and everyone is signed out.
// The records themselves are retained (not purged) until the platform runs its own retention process.
const closeCompany = async (companyId) => {
  const company = await Company.findById(companyId);
  if (!company) throw new ServiceError(404, 'That company no longer exists.');
  company.status = 'deleted';
  company.deletedAt = new Date();
  await company.save();
  await runAsTenant(company._id, () => Session.updateMany({ revokedAt: null }, { revokedAt: new Date() }));
  return company.name;
};

export const executeDeleteRequest = async (request) => {
  if (request.targetType === 'company') return closeCompany(request.companyId);
  const run = EXECUTORS[request.targetType];
  if (!run) throw new ServiceError(400, 'Unsupported delete target.');
  return runAsTenant(request.companyId, () => run(request.targetId));
};
