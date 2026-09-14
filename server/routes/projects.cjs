const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const prisma = require('../utils/prisma.cjs');
const { requireFeature, planFor, hasFeature } = require('../utils/plans.cjs');
const { sanitizeHtml } = require('../utils/sanitize.cjs');
const crypto = require('crypto');
const { sendEmail, appUrl, layout, button } = require('../utils/email.cjs');

router.get('/test-route', (req, res) => {
  res.send('Projects test route is working!');
});

// @route   GET api/projects
// @desc    Get all projects for the logged-in user's company
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const { name, status, ownerId, sortBy } = req.query;

    const whereClause = {
      companyId: user.companyId,
      isArchived: false,
    };

    if (name) {
      whereClause.name = {
        contains: name,
        mode: 'insensitive', // Case-insensitive search
      };
    }

    if (status) {
      if (status === 'completed') {
        whereClause.isCompleted = true;
      } else {
        whereClause.status = status;
      }
    } else {
      whereClause.isCompleted = false;
    }

    if (ownerId) {
      whereClause.ownerId = ownerId;
    }

    let orderByClause = { createdAt: 'desc' }; // Default sort

    if (sortBy === 'oldest') {
      orderByClause = { createdAt: 'asc' };
    } else if (sortBy === 'dueDate_asc') {
      orderByClause = { deadlineDate: 'asc' };
    } else if (sortBy === 'dueDate_desc') {
      orderByClause = { deadlineDate: 'desc' };
    }

    const projects = await prisma.project.findMany({
      where: whereClause,
      include: {
        owner: { select: { id: true, username: true, name: true } },
        questions: {
          orderBy: { createdAt: 'asc' },
          select: { // Use select for scalar fields
            id: true,
            text: true,
            status: true,
            answer: true,
            maxLimit: true,
            limitUnit: true,
            createdAt: true,
            updatedAt: true,
            assignedTo: { select: { id: true, username: true, name: true } },
            assignmentLogs: true, // Include assignment logs
          },
        },
        versions: true,
      },
    });
    res.json(projects);
  } catch (error) {
    console.error('Error fetching projects by company:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// @route   POST api/projects
// @desc    Create a project with optional questions (admin or editor)
router.post('/', auth, async (req, res) => {
  const { name, description, deadlineDate, details, questions } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ msg: 'Project name is required.' });
  if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
  if (!['admin', 'editor', 'approver'].includes(req.user.role)) return res.status(403).json({ msg: 'Viewers cannot create projects.' });
  try {
    const company = await prisma.company.findUnique({ where: { id: req.user.companyId }, select: { plan: true, kind: true, trialEndsAt: true } });
    const plan = planFor(company);
    if (plan.limits.totalProjects !== null) {
      const total = await prisma.project.count({ where: { companyId: req.user.companyId } });
      if (total >= plan.limits.totalProjects) return res.status(402).json({ msg: `The Free plan includes ${plan.limits.totalProjects} grant${plan.limits.totalProjects === 1 ? '' : 's'}. Upgrade to ${plan.kind === 'writer' ? 'Starter' : 'Solo Writer'} for unlimited projects.`, feature: 'unlimited_projects', upgrade: true });
    }
    let qs = Array.isArray(questions) ? questions.filter(q => q && q.text && q.text.trim()) : [];
    if (plan.limits.questionsPerProject !== null && qs.length > plan.limits.questionsPerProject) return res.status(402).json({ msg: `The Free plan allows ${plan.limits.questionsPerProject} questions per project. Upgrade for unlimited questions.`, feature: 'unlimited_projects', upgrade: true });
    const project = await prisma.project.create({
      data: {
        name: name.trim(),
        description: description || null,
        deadlineDate: deadlineDate ? new Date(deadlineDate) : null,
        details: details || undefined,
        ownerId: req.user.id,
        companyId: req.user.companyId,
        questions: {
          create: qs.map(q => ({
            text: q.text.trim(),
            assignedToId: q.assignedToId || null,
            maxLimit: q.maxLimit ? parseInt(q.maxLimit, 10) || null : null,
            limitUnit: q.limitUnit || null,
            status: 'pending',
          })),
        },
      },
      include: { questions: true, owner: { select: { username: true, name: true } } },
    });
    const logs = project.questions.filter(q => q.assignedToId).map(q => ({ questionId: q.id, assignedById: req.user.id, assignedToId: q.assignedToId }));
    if (logs.length) await prisma.questionAssignmentLog.createMany({ data: logs });
    res.json(project);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ msg: 'Could not create the project.' });
  }
});

// @route   GET api/projects/archived
// @desc    Get all archived projects for the logged-in user's company
// @access  Private
router.get('/archived', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const projects = await prisma.project.findMany({
      where: {
        companyId: user.companyId,
        isArchived: true,
      },
      include: {
        owner: { select: { id: true, username: true, name: true } },
        company: { select: { name: true } },
      },
    });
    console.log("Archived projects fetched:", projects);
    res.json(projects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/pending-approval-count', auth, async (req, res) => {
  if (req.user.role !== 'approver') {
    return res.status(403).json({ msg: 'Authorization denied. Not an approver.' });
  }

  try {
    const pendingCount = await prisma.approvalRequest.count({
      where: {
        approverId: req.user.id,
        status: 'pending',
      },
    });
    res.json({ count: pendingCount });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



// @route   GET api/projects/completed
// @desc    Get all completed projects for the logged-in user's company
// @access  Private
router.get('/completed', auth, requireFeature(prisma, 'past_proposals'), async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const completedProjects = await prisma.project.findMany({
      where: {
        companyId: user.companyId,
        isCompleted: true, // Filter for completed projects
      },
      include: { owner: { select: { id: true, username: true, name: true } }, company: { select: { name: true } } },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(completedProjects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/deadlines
// @desc    Get all project deadlines for the logged-in user's company
// @access  Private
router.get('/deadlines', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const deadlines = await prisma.project.findMany({
      where: {
        companyId: user.companyId,
        isArchived: false,
        deadlineDate: {
          not: null, // Only projects with a deadline date
        },
      },
      select: {
        id: true,
        name: true,
        deadlineDate: true,
        status: true,
        isCompleted: true,
        owner: { select: { id: true, name: true, username: true } },
        questions: { select: { status: true } },
      },
      orderBy: {
        deadlineDate: 'asc', // Order by deadline date
      },
    });

    // Format the deadlines for the client
    const formattedDeadlines = deadlines.map(project => ({
      id: project.id,
      name: project.name,
      projectName: project.name,
      deadlineDate: project.deadlineDate,
      status: project.status,
      isCompleted: project.isCompleted,
      owner: project.owner,
      total: project.questions.length,
      done: project.questions.filter(q => q.status === 'submitted').length,
    }));

    res.json(formattedDeadlines);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/pending-approval
// @desc    Get projects pending approval for the current approver
// @access  Private (approver only)
router.get('/pending-approval', auth, async (req, res) => {
  if (req.user.role !== 'approver') {
    return res.status(403).json({ msg: 'Authorization denied. Not an approver.' });
  }

  try {
    const pendingApprovals = await prisma.approvalRequest.findMany({
      where: {
        approverId: req.user.id,
        status: 'pending',
      },
      include: {
        project: {
          include: { owner: { select: { id: true, username: true, name: true } } },
        },
        requestedBy: { select: { id: true, username: true, name: true } },
      },
      orderBy: {
        requestedAt: 'asc',
      },
    });
    console.log('Pending Approvals from DB:', pendingApprovals);
    res.json(pendingApprovals);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/rejected
// @desc    Get all rejected projects for the logged-in user's company
// @access  Private
router.get('/rejected', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const rejectedProjects = await prisma.project.findMany({
      where: {
        companyId: user.companyId,
        status: 'rejected', // Filter for rejected projects
      },
      include: {
        owner: { select: { id: true, username: true, name: true } },
        company: { select: { name: true } },
        approvalRequests: {
          where: { status: 'rejected' },
          orderBy: { respondedAt: 'desc' },
          take: 1, // Get the latest rejection comments
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(rejectedProjects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/questions/assigned', auth, async (req, res) => {
  try {
    console.log('Fetching assigned questions for user ID:', req.user.id);
    const assignedQuestions = await prisma.question.findMany({
      where: {
        assignedToId: req.user.id,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            deadlineDate: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        assignmentLogs: {
          include: {
            assignedBy: { select: { id: true, username: true, name: true } },
            assignedTo: { select: { id: true, username: true, name: true } },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    console.log('Found assigned questions:', assignedQuestions.length);
    res.json(assignedQuestions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/projects/with-assigned-questions
// @desc    Get all projects that have at least one assigned question
// @access  Private
router.get('/with-assigned-questions', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const projects = await prisma.project.findMany({
      where: {
        companyId: user.companyId,
        questions: { some: {} }, // Filter for projects that have at least one question
      },
      include: {
        owner: { select: { id: true, username: true, name: true } },
        questions: {
          include: {
            assignedTo: { select: { id: true, username: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(projects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/upload-document
// @desc    Upload a document, parse questions/answers, and create a project
// @access  Private
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() }); // files will be stored in memory
const pdf = require('pdf-parse'); // Import pdf-parse
router.post('/upload-document', auth, upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: 'No file uploaded' });
    }

    let extractedText = '';
    const fileExtension = req.file.originalname.split('.').pop().toLowerCase();

    if (fileExtension === 'pdf') {
      const dataBuffer = req.file.buffer; // Read from buffer
      const data = await pdf(dataBuffer);
      extractedText = data.text;
    } else if (fileExtension === 'txt') {
      extractedText = req.file.buffer.toString('utf8'); // Read from buffer
    } else {
      // Handle other file types or return an error
      return res.status(400).json({ msg: `Unsupported file type: ${fileExtension}` });
    }

    // --- Improved Q&A Extraction Logic ---
    const questionsAndAnswers = [];
    const sentences = extractedText.split(/(?<=[.?!])\s+/); // Split by sentence-ending punctuation

    let currentQuestion = null;
    let currentAnswerSentences = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue; // Skip empty sentences

      const isQuestion = sentence.endsWith('?') || /^(who|what|where|when|why|how)\b/i.test(sentence);

      if (isQuestion) {
        // If we have a previous question, save it with its answer
        if (currentQuestion) {
          questionsAndAnswers.push({
            text: currentQuestion,
            answer: currentAnswerSentences.join(' ').trim()
          });
        }
        // Start a new question
        currentQuestion = sentence;
        currentAnswerSentences = [];
      } else {
        // If it's not a question, and we have a current question, add it to the answer
        if (currentQuestion) {
          currentAnswerSentences.push(sentence);
        }
      }
    }

    // Add the last question if any
    if (currentQuestion) {
      questionsAndAnswers.push({
        text: currentQuestion,
        answer: currentAnswerSentences.join(' ').trim()
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const projectName = `Parsed Project from ${req.file.originalname}`;
    const projectDescription = extractedText.substring(0, 500) + (extractedText.length > 500 ? '...' : ''); // Use first 500 chars as description

    const newProject = await prisma.project.create({
      data: {
        name: projectName,
        description: projectDescription,
        ownerId: req.user.id,
        companyId: user.companyId,
        isCompleted: true, // Mark as completed for past projects
        questions: {
          create: questionsAndAnswers.length > 0 ? questionsAndAnswers.map(qa => ({
            text: qa.text,
            // For now, we're storing the answer in the question's description or a separate field if available
            // Since our Question model only has 'text', we'll append answer to text for now or ignore.
            // For this iteration, we'll just create questions.
            status: 'pending', // Default status for newly parsed questions
          })) : [{ text: 'No specific questions found. Document parsed.', status: 'completed' }],
        },
      },
      include: {
        questions: true,
      },
    });
    res.json({ msg: 'Document uploaded and project created successfully', project: newProject });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
}); // This closes the router.post('/upload-document', ...) route

    // No need to clean up file as it was stored in memory

// @route   POST api/projects/parse-pasted-text
// @desc    Parse pasted text and create a new completed project
// @access  Private
router.post('/parse-pasted-text', auth, async (req, res) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ msg: 'No content provided' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const lines = content.split('\n');
    const name = lines[0];
    const description = lines.slice(1).join('\n');

    // --- Improved Q&A Extraction Logic ---
    const questionsAndAnswers = [];
    const sentences = content.split(/(?<=[.?!])\s+/); // Split by sentence-ending punctuation

    let currentQuestion = null;
    let currentAnswerSentences = [];

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (!sentence) continue; // Skip empty sentences

      const isQuestion = sentence.endsWith('?') || /^(who|what|where|when|why|how)\b/i.test(sentence);

      if (isQuestion) {
        // If we have a previous question, save it with its answer
        if (currentQuestion) {
          questionsAndAnswers.push({
            text: currentQuestion,
            answer: currentAnswerSentences.join(' ').trim()
          });
        }
        // Start a new question
        currentQuestion = sentence;
        currentAnswerSentences = [];
      } else {
        // If it's not a question, and we have a current question, add it to the answer
        if (currentQuestion) {
          currentAnswerSentences.push(sentence);
        }
      }
    }

    // Add the last question if any
    if (currentQuestion) {
      questionsAndAnswers.push({
        text: currentQuestion,
        answer: currentAnswerSentences.join(' ').trim()
      });
    }

    const newProject = await prisma.project.create({
      data: {
        name,
        description,
        ownerId: req.user.id,
        companyId: user.companyId,
        isCompleted: true,
        status: 'completed',
        questions: {
          create: questionsAndAnswers.length > 0 ? questionsAndAnswers.map(qa => ({
            text: qa.text,
            answer: qa.answer,
            status: 'pending',
          })) : [],
        },
      },
      include: {
        owner: { select: { id: true, username: true, name: true } },
        company: { select: { name: true } },
        questions: true,
      }
    });

    res.json({ msg: 'Project created successfully', project: newProject });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ---------- Answer bank ----------

const STOP = new Set(['the','and','for','with','our','your','you','that','this','from','are','was','but','not','have','has','how','what','why','who','when','where','which','will','does','did','please','describe','explain','provide','about','into','their','they','them','these','those','than','then','can','any','all','each','per','its','also','been','being','would','should','could','more','most','such','other','over','under','use','used','using','include','including','list','give','tell','us','we','of','to','in','on','a','an','is','it','as','at','by','or','be','do','if','so','up','no','yes']);

function terms(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP.has(w))
    .map(w => w.replace(/(ing|ings|ed|es|s|ies|ion|ions|ly)$/, '').replace(/^$/, w));
}

function similarity(a, b) {
  const A = new Set(terms(a)); const B = new Set(terms(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; A.forEach(t => { if (B.has(t)) inter += 1; });
  const jaccard = inter / (A.size + B.size - inter);
  const overlap = inter / Math.min(A.size, B.size);
  return Math.round((0.5 * jaccard + 0.5 * overlap) * 100) / 100;
}

async function answeredQuestions(companyId, excludeQuestionId) {
  const rows = await prisma.question.findMany({
    where: {
      project: { companyId },
      answer: { not: null },
      NOT: excludeQuestionId ? { id: excludeQuestionId } : undefined,
    },
    select: {
      id: true, text: true, answer: true, status: true, updatedAt: true, maxLimit: true, limitUnit: true,
      project: { select: { id: true, name: true, isCompleted: true, status: true, deadlineDate: true, createdAt: true } },
      assignedTo: { select: { id: true, name: true, username: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.filter(r => r.answer && r.answer.trim().length > 20);
}

// @route   GET api/projects/answers/bank?q=
// @desc    Every answered question in the workspace, searchable
router.get('/answers/bank', auth, requireFeature(prisma, 'answer_bank'), async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const rows = await answeredQuestions(req.user.companyId);
    const q = String(req.query.q || '').trim();
    let out = rows;
    if (q) {
      out = rows.map(r => ({ ...r, score: Math.max(similarity(q, r.text), (r.answer.toLowerCase().includes(q.toLowerCase()) || r.text.toLowerCase().includes(q.toLowerCase())) ? 0.6 : 0) }))
        .filter(r => r.score > 0).sort((a, b) => b.score - a.score);
    }
    res.json(out.slice(0, 200));
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/questions/:id/similar
// @desc    Previously answered questions that look like this one
router.get('/questions/:id/similar', auth, requireFeature(prisma, 'answer_bank'), async (req, res) => {
  try {
    const question = await prisma.question.findUnique({ where: { id: req.params.id }, include: { project: { select: { companyId: true, id: true } } } });
    if (!question || question.project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Question not found' });
    const rows = await answeredQuestions(req.user.companyId, question.id);
    const matches = rows
      .map(r => ({ ...r, score: similarity(question.text, r.text) }))
      .filter(r => r.score >= 0.3)
      .sort((a, b) => b.score - a.score || new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 3);
    res.json(matches);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/:id/narrative/versions  (Premium)
router.get('/:id/narrative/versions', auth, requireFeature(prisma, 'narrative_editing'), async (req, res) => {
  try {
    const narrative = await prisma.narrative.findUnique({ where: { projectId: req.params.id }, include: { project: { select: { companyId: true } }, versions: { orderBy: { versionNumber: 'desc' } } } });
    if (!narrative || narrative.project.companyId !== req.user.companyId) return res.json([]);
    const userIds = [...new Set(narrative.versions.map(v => v.createdById))];
    const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, username: true } });
    const byId = Object.fromEntries(users.map(u => [u.id, u]));
    res.json(narrative.versions.map(v => ({ ...v, createdBy: byId[v.createdById] || null })));
  } catch (err) { res.status(500).send('Server Error'); }
});

// @route   PUT api/projects/:id/narrative  (Premium) — edit the merged document; previous text is saved as a version
router.put('/:id/narrative', auth, requireFeature(prisma, 'narrative_editing'), async (req, res) => {
  const content = String(req.body.content || '');
  const note = req.body.note ? String(req.body.note).slice(0, 200) : null;
  if (!content.trim()) return res.status(400).json({ msg: 'The narrative cannot be empty.' });
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { narrative: { include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } } } });
    if (!project || project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Project not found' });
    if (project.ownerId !== req.user.id && !['admin', 'editor', 'approver'].includes(req.user.role)) return res.status(403).json({ msg: 'Not authorized to edit the narrative.' });
    if (!project.narrative) return res.status(400).json({ msg: 'Merge the answers first, then edit the narrative.' });
    const prev = project.narrative;
    const nextVersion = prev.versions[0] ? prev.versions[0].versionNumber + 1 : 1;
    const [, narrative] = await prisma.$transaction([
      prisma.narrativeVersion.create({ data: { narrativeId: prev.id, versionNumber: nextVersion, content: prev.content, note: note || 'Edited', createdById: req.user.id } }),
      prisma.narrative.update({ where: { id: prev.id }, data: { content, authorId: req.user.id } }),
    ]);
    res.json(narrative);
  } catch (err) { console.error(err); res.status(500).send('Server Error'); }
});

// @route   POST api/projects/:id/narrative/restore/:versionId  (Premium)
router.post('/:id/narrative/restore/:versionId', auth, requireFeature(prisma, 'narrative_editing'), async (req, res) => {
  try {
    const narrative = await prisma.narrative.findUnique({ where: { projectId: req.params.id }, include: { project: { select: { companyId: true } }, versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
    if (!narrative || narrative.project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Narrative not found' });
    const version = await prisma.narrativeVersion.findUnique({ where: { id: req.params.versionId } });
    if (!version || version.narrativeId !== narrative.id) return res.status(404).json({ msg: 'Version not found' });
    const nextVersion = narrative.versions[0] ? narrative.versions[0].versionNumber + 1 : 1;
    const [, updated] = await prisma.$transaction([
      prisma.narrativeVersion.create({ data: { narrativeId: narrative.id, versionNumber: nextVersion, content: narrative.content, note: `Before restoring v${version.versionNumber}`, createdById: req.user.id } }),
      prisma.narrative.update({ where: { id: narrative.id }, data: { content: version.content, authorId: req.user.id } }),
    ]);
    res.json(updated);
  } catch (err) { res.status(500).send('Server Error'); }
});

// @route   GET api/projects/:id/export/:format  (pdf | docx)
// @desc    Download the merged narrative as a document
router.get('/:id/export/:format', auth, async (req, res) => {
  const { buildPdf, buildDocx, safeName } = require('../utils/export.cjs');
  const format = String(req.params.format || '').toLowerCase();
  if (!['pdf', 'docx'].includes(format)) return res.status(400).json({ msg: 'Format must be pdf or docx.' });
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { questions: { orderBy: { createdAt: 'asc' }, select: { text: true, answer: true } }, company: { select: { name: true, plan: true, kind: true, trialEndsAt: true } }, narrative: true },
    });
    if (!project || project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Project not found' });
    // Premium workspaces can edit the merged document; exports then use that text instead of raw answers.
    if (project.narrative && hasFeature(project.company, 'narrative_editing')) project.narrativeText = project.narrative.content;
    const filename = `${safeName(project.name)}.${format}`;
    if (format === 'pdf') {
      const buf = await buildPdf(project, project.company);
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"` });
      return res.send(buf);
    }
    const buf = await buildDocx(project, project.company);
    res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="${filename}"` });
    return res.send(buf);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ msg: 'Could not build the document.' });
  }
});

// @route   GET api/projects/dashboard
// @desc    Summary numbers for the dashboard
router.get('/dashboard/summary', auth, async (req, res) => {
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const companyId = req.user.companyId;
    const [active, pendingApproval, myOpenQuestions, upcoming, recent] = await Promise.all([
      prisma.project.count({ where: { companyId, isArchived: false, isCompleted: false } }),
      prisma.project.count({ where: { companyId, isArchived: false, status: 'pending_approval' } }),
      prisma.question.count({ where: { assignedToId: req.user.id, status: { not: 'submitted' }, project: { companyId, isArchived: false, isCompleted: false } } }),
      prisma.project.findMany({
        where: { companyId, isArchived: false, isCompleted: false, deadlineDate: { gte: new Date() } },
        orderBy: { deadlineDate: 'asc' }, take: 5,
        select: { id: true, name: true, deadlineDate: true, status: true, questions: { select: { status: true } } },
      }),
      prisma.project.findMany({
        where: { companyId, isArchived: false },
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, name: true, createdAt: true, status: true, isCompleted: true, owner: { select: { name: true, username: true } }, questions: { select: { status: true } } },
      }),
    ]);
    let awaitingMyApproval = 0;
    if (req.user.role === 'approver') {
      awaitingMyApproval = await prisma.approvalRequest.count({ where: { approverId: req.user.id, status: 'pending' } });
    }
    res.json({ active, pendingApproval, myOpenQuestions, awaitingMyApproval, upcoming, recent });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// @route   GET api/projects/:id
// @desc    Get a single project by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        owner: { select: { id: true, username: true, name: true } },
        questions: {
          orderBy: { createdAt: 'asc' },
          include: {
            assignedTo: { select: { id: true, username: true, name: true } },
            assignmentLogs: {
              include: {
                assignedBy: { select: { id: true, username: true, name: true } },
                assignedTo: { select: { id: true, username: true, name: true } },
              },
            },
          },
        },
        narrative: true,
        company: { select: { name: true } },
        approvalRequests: {
          orderBy: { requestedAt: 'desc' },
          include: { approver: { select: { id: true, username: true, name: true } }, requestedBy: { select: { id: true, username: true, name: true } } },
        },
      },
    });

    if (!project || project.companyId !== req.user.companyId) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    res.json(project);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/projects/:id
// @desc    Update a project
// @access  Private (owner only)
router.put('/:id', auth, async (req, res) => {
  const { name, description, details, isCompleted } = req.body; // Add isCompleted

  try {
    let project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { company: true } });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    if (project.ownerId !== req.user.id && !(req.user.role === 'admin' && project.companyId === req.user.companyId)) {
      return res.status(401).json({ msg: 'User not authorized to update this project' });
    }

    // Create a snapshot before updating
    const latestVersion = await prisma.projectVersion.findMany({
      where: { projectId: project.id },
      orderBy: { versionNumber: 'desc' },
      take: 1,
    });

    const newVersionNumber = latestVersion.length > 0 ? latestVersion[0].versionNumber + 1 : 1;

    await prisma.projectVersion.create({
      data: {
        projectId: project.id,
        versionNumber: newVersionNumber,
        snapshot: { ...project, companyName: project.company?.name || null }, // Store the current project state as a snapshot, including companyName for display
        createdById: req.user.id,
      },
    });

    project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name: name || project.name,
        details: details || project.details,
        description: description !== undefined ? description : project.description,
        deadlineDate: req.body.deadlineDate !== undefined ? (req.body.deadlineDate ? new Date(req.body.deadlineDate) : null) : project.deadlineDate,
        isCompleted: typeof isCompleted === 'boolean' ? isCompleted : project.isCompleted, // Update isCompleted
      },
    });
    res.json(project);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/projects/:id
// @desc    Delete a project
// @access  Private (owner only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { company: true } });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.companyId !== project.companyId) {
      return res.status(401).json({ msg: 'User not authorized to delete this project' });
    }

    if (project.ownerId !== req.user.id && user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized to delete this project' });
    }

    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ msg: 'Project removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ msg: 'Server Error' });
  }
});

// @route   GET api/projects/:id/versions
// @desc    Get all versions for a project
// @access  Private
router.get('/:id/versions', auth, async (req, res) => {
  try {
    const projectVersions = await prisma.projectVersion.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, username: true, name: true } } },
    });
    res.json(projectVersions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/:projectId/summary
// @desc    Get summary of questions for a project (total, completed, user completion status)
// @access  Private
router.get('/:projectId/summary', auth, async (req, res) => {
  try {
    const { projectId } = req.params;

    // Verify project exists and user has access
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { owner: true, company: true }
    });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Ensure user belongs to the same company as the project
    if (req.user.companyId !== project.companyId) {
      return res.status(401).json({ msg: 'Not authorized to view this project summary' });
    }

    const questions = await prisma.question.findMany({
      where: { projectId },
      include: {
        assignedTo: {
          select: { id: true, username: true, name: true }
        }
      }
    });

    const totalQuestions = questions.length;
    const completedQuestions = questions.filter(q => q.status === 'completed' || q.status === 'submitted').length;

    const userCompletion = {};
    const allAssignees = new Set();

    questions.forEach(q => {
      if (q.assignedTo) {
        const userId = q.assignedTo.id;
        const username = q.assignedTo.username;
        allAssignees.add(userId);

        if (!userCompletion[userId]) {
          userCompletion[userId] = {
            id: userId,
            username: username,
            totalAssigned: 0,
            completed: 0,
            pending: 0,
            submitted: 0,
            notCompleted: 0 // Questions not yet completed or submitted
          };
        }
        userCompletion[userId].totalAssigned++;
        if (q.status === 'completed') {
          userCompletion[userId].completed++;
        } else if (q.status === 'submitted') {
          userCompletion[userId].submitted++;
        } else {
          userCompletion[userId].pending++;
        }
      }
    });

    // Calculate notCompleted for each user
    Object.values(userCompletion).forEach(user => {
      user.notCompleted = user.totalAssigned - (user.completed + user.submitted);
    });

    // Get all users in the company to identify those who haven't been assigned any questions
    const companyUsers = await prisma.user.findMany({
      where: { companyId: project.companyId },
      select: { id: true, username: true, name: true }
    });

    const usersNotAssigned = companyUsers.filter(u => !allAssignees.has(u.id));

    // Identify users who have assigned questions but haven't completed all of them
    const usersWithIncompleteQuestions = Object.values(userCompletion).filter(user => user.notCompleted > 0);

    res.json({
      totalQuestions,
      completedQuestions,
      userCompletion: Object.values(userCompletion),
      usersNotAssigned,
      usersWithIncompleteQuestions
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



// @route   GET api/projects/deadlines
// @desc    Get all project deadlines for the logged-in user's company
// @access  Private
router.get('/deadlines', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const deadlines = await prisma.project.findMany({
      where: {
        companyId: user.companyId,
        isArchived: false,
        deadlineDate: {
          not: null, // Only projects with a deadline date
        },
      },
      select: {
        id: true,
        name: true,
        deadlineDate: true,
        status: true,
        isCompleted: true,
        owner: { select: { id: true, name: true, username: true } },
        questions: { select: { status: true } },
      },
      orderBy: {
        deadlineDate: 'asc', // Order by deadline date
      },
    });

    // Format the deadlines for the client
    const formattedDeadlines = deadlines.map(project => ({
      id: project.id,
      name: project.name,
      projectName: project.name,
      deadlineDate: project.deadlineDate,
      status: project.status,
      isCompleted: project.isCompleted,
      owner: project.owner,
      total: project.questions.length,
      done: project.questions.filter(q => q.status === 'submitted').length,
    }));

    res.json(formattedDeadlines);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/pending-approval
// @desc    Get projects pending approval for the current approver
// @access  Private (approver only)
router.get('/pending-approval', auth, async (req, res) => {
  if (req.user.role !== 'approver') {
    return res.status(403).json({ msg: 'Authorization denied. Not an approver.' });
  }

  try {
    const pendingApprovals = await prisma.approvalRequest.findMany({
      where: {
        approverId: req.user.id,
        status: 'pending',
      },
      include: {
        project: {
          include: { owner: { select: { id: true, username: true, name: true } } },
        },
        requestedBy: { select: { id: true, username: true, name: true } },
      },
      orderBy: {
        requestedAt: 'asc',
      },
    });
    console.log('Pending Approvals from DB:', pendingApprovals);
    res.json(pendingApprovals);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/:id/request-approval
// @desc    Request approval for a project
// @access  Private
router.post('/:id/request-approval', auth, async (req, res) => {
  const { approverId } = req.body;

  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Project owner or a workspace admin can request approval
    if (project.ownerId !== req.user.id && !(req.user.role === 'admin' && project.companyId === req.user.companyId)) {
      return res.status(401).json({ msg: 'User not authorized to request approval for this project' });
    }

    const approvalCompany = await prisma.company.findUnique({ where: { id: project.companyId }, select: { plan: true, kind: true, trialEndsAt: true } });
    if (!hasFeature(approvalCompany, 'approvals')) return res.status(402).json({ msg: 'Approvals are part of team workspaces.', feature: 'approvals', upgrade: true });

    // Ensure the approver exists and is in the same company
    const approver = await prisma.user.findUnique({ where: { id: approverId } });
    if (!approver || approver.companyId !== project.companyId || approver.role !== 'approver') {
      return res.status(400).json({ msg: 'Invalid approver selected' });
    }

    // Update project status
    await prisma.project.update({
      where: { id: req.params.id },
      data: { status: 'pending_approval' },
    });

    // Create approval request log
    const approvalRequest = await prisma.approvalRequest.create({
      data: {
        projectId: req.params.id,
        requestedById: req.user.id,
        approverId: approverId,
        status: 'pending',
      },
    });

    res.json({ msg: 'Approval request sent', approvalRequest });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/rejected
// @desc    Get all rejected projects for the logged-in user's company
// @access  Private
router.get('/rejected', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { company: true } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const rejectedProjects = await prisma.project.findMany({
      where: {
        companyId: user.companyId,
        status: 'rejected', // Filter for rejected projects
      },
      include: {
        owner: { select: { id: true, username: true, name: true } },
        company: { select: { name: true } },
        approvalRequests: {
          where: { status: 'rejected' },
          orderBy: { respondedAt: 'desc' },
          take: 1, // Get the latest rejection comments
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(rejectedProjects);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/projects/:id/respond-approval
// @desc    Approve or reject a project
// @access  Private (approver only)
router.put('/:id/respond-approval', auth, async (req, res) => {
  if (req.user.role !== 'approver') {
    return res.status(403).json({ msg: 'Authorization denied. Not an approver.' });
  }

  const { approvalStatus, comments } = req.body; // approvalStatus: 'approved' or 'rejected'

  try {
    const approvalRequest = await prisma.approvalRequest.findFirst({
      where: {
        projectId: req.params.id,
        approverId: req.user.id,
        status: 'pending',
      },
    });

    if (!approvalRequest) {
      return res.status(404).json({ msg: 'Pending approval request not found for this project and approver.' });
    }

    // Update the approval request
    await prisma.approvalRequest.update({
      where: { id: approvalRequest.id },
      data: {
        status: approvalStatus,
        comments: comments || null,
        respondedAt: new Date(),
      },
    });

    // Update project status based on approval response
    await prisma.project.update({
      where: { id: req.params.id },
      data: {
        status: approvalStatus, // Set status to 'approved' or 'rejected'
      },
    });

    res.json({ msg: `Project ${approvalStatus} successfully` });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/projects/pending-approval-count
// @desc    Get count of pending approval requests for the current approver
// @access  Private (approver only)
router.put('/questions/:id/assign', auth, async (req, res) => {
  const { assignedToId, status, answer, text } = req.body; // Add text

  try {
    let question = await prisma.question.findUnique({ where: { id: req.params.id } });

    if (!question) {
      return res.status(404).json({ msg: 'Question not found' });
    }

    // Authorization: Only project owner or admin can assign/update questions
    // Or the assigned user can update their own answer/status
    const project = await prisma.project.findUnique({ where: { id: question.projectId } });
    const isAuthorizedToAssign = (project.ownerId === req.user.id || req.user.role === 'admin');
    const isAssignedUser = (question.assignedToId === req.user.id);

    if (!isAuthorizedToAssign && !isAssignedUser) {
      return res.status(401).json({ msg: 'User not authorized to update this question' });
    }

    // Log assignment change if assignedToId is different and user is authorized to assign
    if (assignedToId && assignedToId !== question.assignedToId && isAuthorizedToAssign) {
      await prisma.questionAssignmentLog.create({
        data: {
          questionId: question.id,
          assignedById: req.user.id, // User who performed the re-assignment
          assignedToId: assignedToId,
        },
      });
    }

    question = await prisma.question.update({
      where: { id: req.params.id },
      data: {
        assignedToId: assignedToId || question.assignedToId,
        status: status || question.status,
        answer: answer || question.answer, // Update answer
        text: text || question.text, // Update text
      },
    });
    res.json(question);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/:id/questions
// @desc    Create a new question for an existing project
// @access  Private (project owner or admin only)
router.post('/questions/:projectId/questions', auth, async (req, res) => {
  const { text, assignedToId, status } = req.body;

  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId } });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Authorization: Only project owner or admin can add questions
    if (project.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized to add questions to this project' });
    }

    const newQuestion = await prisma.question.create({
      data: {
        projectId: req.params.projectId,
        text,
        assignedToId: assignedToId || null,
        status: status || 'pending',
      },
    });
    res.json(newQuestion);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET /api/projects/:projectId/questions/assigned-to-me
// @desc    Get questions assigned to the logged-in user for a specific project
// @access  Private
router.get('/:projectId/questions/assigned-to-me', auth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    // Verify project exists and user has access (optional, but good practice)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { owner: true, company: true }
    });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Ensure user belongs to the same company as the project
    if (req.user.companyId !== project.companyId) {
      return res.status(401).json({ msg: 'Not authorized to view questions for this project' });
    }

    const assignedQuestions = await prisma.question.findMany({
      where: {
        projectId: projectId,
        assignedToId: userId,
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
            deadlineDate: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            username: true,
            name: true,
          },
        },
        assignmentLogs: {
          include: {
            assignedBy: { select: { id: true, username: true, name: true } },
            assignedTo: { select: { id: true, username: true, name: true } },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    res.json(assignedQuestions);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



// @route   PUT api/projects/:id/archive
// @desc    Archive a project
// @access  Private (owner or admin)
router.put('/:id/archive', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || (project.ownerId !== req.user.id && user.role !== 'admin')) {
      return res.status(401).json({ msg: 'User not authorized to archive this project' });
    }

    const updatedProject = await prisma.project.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    res.json(updatedProject);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   DELETE api/projects/questions/:id
// @desc    Delete a question
// @access  Private (admin only)
router.delete('/questions/:id', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized to delete questions' });
    }

    const question = await prisma.question.findUnique({ where: { id: req.params.id } });
    if (!question) {
      return res.status(404).json({ msg: 'Question not found' });
    }

    await prisma.question.delete({ where: { id: req.params.id } });
    res.json({ msg: 'Question removed' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/projects/questions/:questionId
// @desc    Update a question's answer and status
// @access  Private (Assigned user or Admin)
router.put('/questions/:questionId', auth, async (req, res) => {
  const { questionId } = req.params;
  const { answer, status } = req.body;

  try {
    let question = await prisma.question.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      return res.status(404).json({ msg: 'Question not found' });
    }

    // Authorization: Only the assigned user or an admin can update the question
    if (req.user.role !== 'admin' && req.user.id !== question.assignedToId) {
      return res.status(401).json({ msg: 'Not authorized to update this question' });
    }

    const updatedData = {};
    if (answer !== undefined) {
      updatedData.answer = answer;
    }
    if (status !== undefined) {
      updatedData.status = status;
    }

    question = await prisma.question.update({
      where: { id: questionId },
      data: updatedData,
    });

    res.json(question);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/:id/compile
// @desc    Compile a project's questions and answers into a narrative
// @access  Private
router.post('/:id/compile', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: { questions: true },
    });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Optional: Add authorization to ensure only project owner or admin can compile
    if (project.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized to compile this project' });
    }

    const narrativeContent = project.questions
      .map((q, i) => `${i + 1}. ${q.text}\n\n${q.answer || '[No answer provided]'}`)
      .join('\n\n');

    const existing = await prisma.narrative.findUnique({ where: { projectId: project.id }, include: { versions: { orderBy: { versionNumber: 'desc' }, take: 1 } } });
    if (existing) {
      const nextVersion = existing.versions[0] ? existing.versions[0].versionNumber + 1 : 1;
      await prisma.narrativeVersion.create({ data: { narrativeId: existing.id, versionNumber: nextVersion, content: existing.content, note: 'Before re-merge', createdById: req.user.id } });
    }

    const narrative = await prisma.narrative.upsert({
      where: { projectId: project.id },
      create: {
        title: `${project.name} - Narrative`,
        content: narrativeContent,
        authorId: req.user.id,
        projectId: project.id,
      },
      update: {
        title: `${project.name} - Narrative`,
        content: narrativeContent,
        authorId: req.user.id,
      },
    });

    res.json(narrative);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/:projectId/questions/manual
// @desc    Manually add a question and answer to a project
// @access  Private
router.post('/:projectId/questions/manual', auth, async (req, res) => {
  const { projectId } = req.params;
  const { questionText, answerText } = req.body;

  try {
    // Basic validation
    if (!questionText || !answerText) {
      return res.status(400).json({ msg: 'Question text and answer text are required.' });
    }

    // Verify project exists and user has access (optional, but good practice)
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, ownerId: true, companyId: true }
    });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found.' });
    }

    // Ensure user is authorized to add questions to this project
    // For example, only project owner or admin
    if (project.ownerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized to add questions to this project.' });
    }

    const newQuestion = await prisma.question.create({
      data: {
        projectId: projectId,
        text: questionText,
        answer: answerText,
        status: 'completed', // Manually added Q&A can be marked as completed by default
        assignedToId: req.user.id, // Assign to the user who added it
      },
    });

    res.json(newQuestion);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/projects/:id/rescind-approval
// @desc    Rescind a project's approval request (admin only)
// @access  Private (admin only)
router.put('/:id/rescind-approval', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Authorization denied. Only admins can rescind approval requests.' });
  }

  try {
    const { id } = req.params;

    const project = await prisma.project.findUnique({
      where: { id },
      include: { approvalRequests: { where: { status: 'pending' } } },
    });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found.' });
    }

    if (project.status !== 'pending_approval') {
      return res.status(400).json({ msg: 'Project is not in pending approval status.' });
    }

    // Update project status back to draft
    await prisma.project.update({
      where: { id },
      data: { status: 'draft' },
    });

    // Update all pending approval requests for this project to 'rescinded'
    await prisma.approvalRequest.updateMany({
      where: { projectId: id, status: 'pending' },
      data: { status: 'rescinded', respondedAt: new Date() },
    });

    res.json({ msg: 'Project approval request rescinded successfully.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// @route   PUT api/projects/:id/unarchive
router.put('/:id/unarchive', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project || project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Project not found' });
    if (project.ownerId !== req.user.id && req.user.role !== 'admin') return res.status(401).json({ msg: 'Not authorized' });
    const updated = await prisma.project.update({ where: { id: req.params.id }, data: { isArchived: false } });
    res.json(updated);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/manual-project
// @desc    Create a completed (past) project from typed Q&A pairs
router.post('/manual-project', auth, requireFeature(prisma, 'past_proposals'), async (req, res) => {
  const { projectTitle, projectDescription, qaPairs } = req.body;
  if (!projectTitle || !projectTitle.trim()) return res.status(400).json({ msg: 'Project title is required.' });
  try {
    if (!req.user.companyId) return res.status(400).json({ msg: 'You are not attached to a workspace.' });
    const pairs = Array.isArray(qaPairs) ? qaPairs.filter(q => q && q.question && q.question.trim()) : [];
    const project = await prisma.project.create({
      data: {
        name: projectTitle.trim(),
        description: projectDescription || null,
        ownerId: req.user.id,
        companyId: req.user.companyId,
        isCompleted: true,
        status: 'completed',
        questions: {
          create: pairs.map(q => ({ text: q.question.trim(), answer: q.answer || null, status: 'completed', assignedToId: req.user.id })),
        },
      },
      include: { owner: { select: { username: true, name: true } }, company: { select: { name: true } }, questions: true },
    });
    res.json({ msg: 'Project created', project });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   POST api/projects/:projectId/questions
// @desc    Add a question to an existing project (owner or admin)
router.post('/:projectId/questions', auth, async (req, res) => {
  const { text, assignedToId, maxLimit, limitUnit } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ msg: 'Question text is required.' });
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.projectId }, include: { _count: { select: { questions: true } }, company: { select: { plan: true, kind: true, trialEndsAt: true } } } });
    if (!project || project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Project not found' });
    if (project.ownerId !== req.user.id && req.user.role !== 'admin') return res.status(401).json({ msg: 'Not authorized to add questions' });
    const qPlan = planFor(project.company);
    if (qPlan.limits.questionsPerProject !== null && project._count.questions >= qPlan.limits.questionsPerProject) return res.status(402).json({ msg: `The Free plan allows ${qPlan.limits.questionsPerProject} questions per project. Upgrade for unlimited questions.`, feature: 'unlimited_projects', upgrade: true });
    const question = await prisma.question.create({
      data: {
        projectId: project.id,
        text: text.trim(),
        assignedToId: assignedToId || null,
        maxLimit: maxLimit ? parseInt(maxLimit, 10) : null,
        limitUnit: limitUnit || null,
        status: 'pending',
      },
      include: { assignedTo: { select: { id: true, username: true, name: true } } },
    });
    if (assignedToId) {
      await prisma.questionAssignmentLog.create({ data: { questionId: question.id, assignedById: req.user.id, assignedToId } });
    }
    res.json(question);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/projects/questions/:id/details
// @desc    Edit a question's text, limits, or assignee (owner or admin)
router.put('/questions/:id/details', auth, async (req, res) => {
  const { text, assignedToId, maxLimit, limitUnit } = req.body;
  try {
    const question = await prisma.question.findUnique({ where: { id: req.params.id }, include: { project: true } });
    if (!question || question.project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Question not found' });
    if (question.project.ownerId !== req.user.id && req.user.role !== 'admin') return res.status(401).json({ msg: 'Not authorized' });
    const data = {};
    if (text !== undefined) data.text = text;
    if (maxLimit !== undefined) data.maxLimit = maxLimit === null || maxLimit === '' ? null : parseInt(maxLimit, 10);
    if (limitUnit !== undefined) data.limitUnit = limitUnit || null;
    if (assignedToId !== undefined) {
      data.assignedToId = assignedToId || null;
      if (assignedToId && assignedToId !== question.assignedToId) {
        await prisma.questionAssignmentLog.create({ data: { questionId: question.id, assignedById: req.user.id, assignedToId } });
        if (question.status === 'submitted') data.status = 'pending';
      }
    }
    const updated = await prisma.question.update({ where: { id: question.id }, data, include: { assignedTo: { select: { id: true, username: true, name: true } } } });
    res.json(updated);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// ---------- Grant notes ----------

// @route   PUT api/projects/:id/notes — rich-text notes for a project (owner, editors, admins)
router.put('/:id/notes', auth, requireFeature(prisma, 'notes'), async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, select: { id: true, companyId: true, ownerId: true } });
    if (!project || project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Project not found' });
    if (project.ownerId !== req.user.id && !['admin', 'editor', 'approver'].includes(req.user.role)) return res.status(403).json({ msg: 'Not authorized to edit notes.' });
    const notes = sanitizeHtml(req.body.notes || '');
    await prisma.project.update({ where: { id: project.id }, data: { notes } });
    res.json({ notes, savedAt: new Date() });
  } catch (err) { res.status(500).send('Server Error'); }
});

// ---------- External review (no account needed) ----------

// @route   POST api/projects/:id/review-link — create or refresh a review link and mark the project as sent
router.post('/:id/review-link', auth, requireFeature(prisma, 'external_review'), async (req, res) => {
  const reviewerName = req.body.reviewerName ? String(req.body.reviewerName).trim().slice(0, 120) : null;
  const reviewerEmail = req.body.reviewerEmail ? String(req.body.reviewerEmail).trim().toLowerCase().slice(0, 200) : null;
  const message = req.body.message ? String(req.body.message).trim().slice(0, 2000) : '';
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id }, include: { company: { select: { name: true } } } });
    if (!project || project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Project not found' });
    if (project.ownerId !== req.user.id && !['admin', 'editor'].includes(req.user.role)) return res.status(403).json({ msg: 'Not authorized.' });
    const token = crypto.randomBytes(20).toString('hex');
    const updated = await prisma.project.update({
      where: { id: project.id },
      data: { reviewToken: token, reviewStatus: 'pending', reviewerName, reviewerEmail, reviewComments: null, reviewSentAt: new Date(), reviewRespondedAt: null, status: project.status === 'draft' ? 'pending_approval' : project.status },
      select: { id: true, reviewToken: true, reviewStatus: true, reviewerName: true, reviewerEmail: true, reviewSentAt: true },
    });
    const link = appUrl(`/review/${token}`);
    let emailed = false;
    if (reviewerEmail) {
      const sender = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true, username: true } });
      emailed = await sendEmail({
        to: reviewerEmail,
        subject: `${sender.name || sender.username} asked you to review "${project.name}"`,
        html: layout(`Please review ${project.name}`, `<p>${sender.name || sender.username} from ${project.company.name} asked you to read this grant proposal and either approve it or send it back with notes. No account needed.</p>${message ? `<blockquote style="border-left:3px solid #7fab61;margin:12px 0;padding:6px 12px;color:#3b3b3d">${message.replace(/</g, '&lt;')}</blockquote>` : ''}${button(link, 'Open the proposal')}`),
        text: `${sender.name || sender.username} asked you to review "${project.name}": ${link}`,
      });
    }
    res.json({ ...updated, link, emailed });
  } catch (err) { console.error(err); res.status(500).send('Server Error'); }
});

// @route   DELETE api/projects/:id/review-link — withdraw the review request
router.delete('/:id/review-link', auth, async (req, res) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project || project.companyId !== req.user.companyId) return res.status(404).json({ msg: 'Project not found' });
    await prisma.project.update({ where: { id: project.id }, data: { reviewToken: null, reviewStatus: null, reviewComments: null, reviewRespondedAt: null, status: project.status === 'pending_approval' ? 'draft' : project.status } });
    res.json({ msg: 'Review request withdrawn.' });
  } catch (err) { res.status(500).send('Server Error'); }
});

module.exports = router;

