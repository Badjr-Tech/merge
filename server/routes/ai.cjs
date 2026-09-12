const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Access your API key as an environment variable (ensure GEMINI_API_KEY is set in .env)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// @route   POST api/ai/review
// @desc    Send a project for AI review
// @access  Private
router.post('/review', auth, async (req, res) => {
  const { projectId, grantWebsite, grantPurposeStatement } = req.body;

  try {
    // Ensure GEMINI_API_KEY is set
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ msg: 'Google Gemini API Key not configured on server.' });
    }

    // Fetch project details from the database
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { owner: { select: { username: true } } },
    });

    if (!project) {
      return res.status(404).json({ msg: 'Project not found' });
    }

    // Basic authorization
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.companyId !== project.companyId) {
      return res.status(401).json({ msg: 'User not authorized to review this project' });
    }

    // Construct the prompt for the Gemini API
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const prompt = `You are an expert grant reviewer. Review the following project proposal in the context of a grant application.\nProject Name: ${project.name}\nProject Description: ${project.description || 'No description provided.'}\nProject Details: ${JSON.stringify(project.details || {})}\n\nGrant Website: ${grantWebsite}\nGrant Purpose Statement: ${grantPurposeStatement}\n\nPlease review the grant website and information about previous winners (if available) to understand the grant's priorities. Based on this information, review the provided project proposal.\nno extra attachements will be viewable, so please do not critique lack of attachments. if the grant notes a special attachment needed, please reference it in the reccomendation list\nFormat your response as a markdown document with the following sections: 5 Highlights, 5 Critiques, Strengths, Weaknesses, and a Recommendation List with a short summary beneath. Keep your commentary under 500 words. Prioritize the recommendations and include a section on how to make the application stand out.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Save the AI review to the database
    await prisma.aIReviewLog.create({
      data: {
        projectId: project.id,
        reviewedById: req.user.id,
        aiResponse: text,
        grantWebsite: grantWebsite,
        grantPurposeStatement: grantPurposeStatement,
      },
    });

    res.json({ review: text });
  } catch (err) {
    console.error('AI Review Error:', err);
    res.status(500).json({ msg: err.message || 'Server Error during AI review.' });
  }
});

// @route   GET api/ai/reviews
// @desc    Get all AI review logs for the logged-in user's company
// @access  Private
router.get('/reviews', auth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const { projectId, reviewedById, sortBy } = req.query;
    const where = {
      project: { // Filter by project's companyId
        companyId: user.companyId,
      },
    };

    if (projectId) {
      where.projectId = projectId;
    }

    if (reviewedById) {
      where.reviewedById = reviewedById;
    }

    const orderBy = {};
    if (sortBy === 'oldest') {
      orderBy.reviewedAt = 'asc';
    } else if (sortBy === 'dueDate_asc') {
      orderBy.project = { deadlineDate: 'asc' };
    } else if (sortBy === 'dueDate_desc') {
      orderBy.project = { deadlineDate: 'desc' };
    } else {
      orderBy.reviewedAt = 'desc';
    }

    const reviews = await prisma.aIReviewLog.findMany({
      where: {
        ...where,
        isArchived: false, // Only fetch non-archived reviews by default
      },
      include: {
        project: {
          select: { name: true, deadlineDate: true },
        },
        reviewedBy: {
          select: { username: true },
        },
      },
      orderBy,
    });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/ai/reviews/:id/archive
// @desc    Archive an AI review
// @access  Private (admin only)
router.put('/reviews/:id/archive', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Authorization denied. Not an admin.' });
  }

  try {
    const review = await prisma.aIReviewLog.update({
      where: { id: req.params.id },
      data: { isArchived: true },
    });

    if (!review) {
      return res.status(404).json({ msg: 'Review not found' });
    }

    res.json({ msg: 'Review archived successfully', review });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/ai/reviews/:id
// @desc    Get a single AI review by ID
// @access  Private
router.get('/reviews/:id', auth, async (req, res) => {
  try {
    const review = await prisma.aIReviewLog.findUnique({
      where: { id: req.params.id },
      include: {
        project: { select: { name: true } },
        reviewedBy: { select: { id: true, username: true, name: true } },
      },
    });

    if (!review) {
      return res.status(404).json({ msg: 'Review not found' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const project = await prisma.project.findUnique({ where: { id: review.projectId } });

    if (!user || user.companyId !== project.companyId) {
      return res.status(401).json({ msg: 'User not authorized to view this review' });
    }

    res.json(review);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/ai/archived-reviews
// @desc    Get all archived AI review logs for the logged-in user's company
// @access  Private (admin only)
router.get('/archived-reviews', auth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ msg: 'Authorization denied. Not an admin.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.companyId) {
      return res.status(400).json({ msg: 'User not associated with a company' });
    }

    const reviews = await prisma.aIReviewLog.findMany({
      where: {
        project: {
          companyId: user.companyId,
        },
        isArchived: true, // Only fetch archived reviews
      },
      include: {
        project: {
          select: { name: true, deadlineDate: true },
        },
        reviewedBy: {
          select: { username: true },
        },
      },
      orderBy: {
        reviewedAt: 'desc',
      },
    });

    res.json(reviews);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;