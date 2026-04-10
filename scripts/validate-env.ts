/**
 * Environment Variable Validator
 * Checks that all required environment variables are set correctly
 */

import { existsSync } from 'fs';
import { resolve } from 'path';

const requiredVars = {
  DATABASE_URL: {
    required: true,
    description: 'PostgreSQL connection string from Neon',
    example: 'postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require'
  },
  NODE_ENV: {
    required: false,
    description: 'Node environment (development, production, test)',
    example: 'production'
  }
};

interface ValidationResult {
  valid: boolean;
  missing: string[];
  invalid: { [key: string]: string };
  warnings: string[];
}

function validateEnv(): ValidationResult {
  const result: ValidationResult = {
    valid: true,
    missing: [],
    invalid: {},
    warnings: []
  };

  // Check .env.local exists in development
  if (process.env.NODE_ENV !== 'production') {
    const envLocalPath = resolve('.env.local');
    if (!existsSync(envLocalPath)) {
      result.warnings.push('⚠️  .env.local not found. Copy .env.example to .env.local and add your DATABASE_URL');
    }
  }

  // Validate each required variable
  for (const [key, config] of Object.entries(requiredVars)) {
    const value = process.env[key];

    if (config.required && !value) {
      result.valid = false;
      result.missing.push(key);
    }

    // Validate DATABASE_URL format
    if (key === 'DATABASE_URL' && value) {
      if (!value.includes('postgresql://')) {
        result.valid = false;
        result.invalid[key] = 'Must be a PostgreSQL connection string starting with postgresql://';
      }
      if (!value.includes('sslmode=require') && process.env.NODE_ENV === 'production') {
        result.warnings.push('⚠️  DATABASE_URL should include sslmode=require for production');
      }
    }
  }

  return result;
}

function printValidationResult(result: ValidationResult): void {
  console.log('\n📋 Environment Variable Validation');
  console.log('==================================\n');

  if (result.missing.length > 0) {
    console.log('❌ Missing Required Variables:');
    for (const key of result.missing) {
      const config = requiredVars[key as keyof typeof requiredVars];
      console.log(`   ${key}: ${config.description}`);
      console.log(`   Example: ${config.example}\n`);
    }
  }

  if (Object.keys(result.invalid).length > 0) {
    console.log('❌ Invalid Variables:');
    for (const [key, message] of Object.entries(result.invalid)) {
      console.log(`   ${key}: ${message}\n`);
    }
  }

  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    for (const warning of result.warnings) {
      console.log(`   ${warning}\n`);
    }
  }

  if (result.valid) {
    console.log('✅ All environment variables are correctly configured!\n');
  } else {
    console.log('❌ Environment validation failed!\n');
    process.exit(1);
  }
}

// Run validation
const result = validateEnv();
printValidationResult(result);

export { validateEnv };
export type { ValidationResult };
