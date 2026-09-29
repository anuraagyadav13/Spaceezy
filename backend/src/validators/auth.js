const { z } = require('zod');

const loginSchema = {
    body: z.object({
        email: z.string().email(),
        password: z.string().min(1, 'Password is required')
    })
};

module.exports = {
    loginSchema
};
