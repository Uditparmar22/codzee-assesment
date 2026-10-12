import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { parse, parseId } from '../../lib/validation.js';
import { currentUser } from '../../middleware/authenticate.js';
import { canManageProject } from '../auth/policies.js';
import { ProjectModel, type ProjectDocument } from '../projects/project.model.js';
import { WebhookDeliveryModel, WebhookModel } from './webhook.model.js';
import { createWebhookSchema } from './webhook.schemas.js';

const MAX_DELIVERIES_LISTED = 50;

/** Routes nested under a project: /projects/:projectId/webhooks */
export function webhookRoutes(): Router {
  const router = Router({ mergeParams: true });

  const projectFrom = async (params: unknown): Promise<ProjectDocument> => {
    const id = parseId((params as Record<string, string>).projectId, 'projectId');
    const project = await ProjectModel.findById(id);
    if (!project) throw new NotFoundError('Project', id);
    return project;
  };

  router.post('/', async (req, res) => {
    const project = await projectFrom(req.params);
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();

    const input = parse(createWebhookSchema, req.body);
    const webhook = await WebhookModel.create({
      ...input,
      projectId: project._id,
      secret: randomBytes(32).toString('hex'),
    });
    res.status(201).json({ ...webhook.toJSON(), secret: webhook.secret });
  });

  router.get('/', async (req, res) => {
    const project = await projectFrom(req.params);
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();
    res.json({ data: await WebhookModel.find({ projectId: project._id }).sort({ _id: 1 }) });
  });

  router.delete('/:webhookId', async (req, res) => {
    const project = await projectFrom(req.params);
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();

    const webhookId = parseId(req.params.webhookId, 'webhookId');
    const webhook = await WebhookModel.findOneAndDelete({ _id: webhookId, projectId: project._id });
    if (!webhook) throw new NotFoundError('Webhook', webhookId);
    await WebhookDeliveryModel.deleteMany({ webhookId: webhook._id });
    res.status(204).end();
  });

  router.get('/:webhookId/deliveries', async (req, res) => {
    const project = await projectFrom(req.params);
    if (!canManageProject(currentUser(req), project)) throw new ForbiddenError();

    const webhookId = parseId(req.params.webhookId, 'webhookId');
    if (!(await WebhookModel.exists({ _id: webhookId, projectId: project._id }))) {
      throw new NotFoundError('Webhook', webhookId);
    }
    const deliveries = await WebhookDeliveryModel.find({ webhookId })
      .sort({ _id: -1 })
      .limit(MAX_DELIVERIES_LISTED);
    res.json({ data: deliveries });
  });

  return router;
}
