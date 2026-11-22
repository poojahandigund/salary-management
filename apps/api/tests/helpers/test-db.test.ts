import { describe, expect, it } from 'vitest';
import { assertIsTestDatabase } from './test-db';

describe('assertIsTestDatabase', () => {
  it('accepts a database whose name ends with _test', () => {
    expect(() => assertIsTestDatabase('postgresql://u:p@localhost:5432/salary_test')).not.toThrow();
  });

  it.each(['salary_dev', 'salary', 'test_salary', 'salary_testing'])(
    'refuses the database "%s"',
    (name) => {
      expect(() => assertIsTestDatabase(`postgresql://u:p@localhost:5432/${name}`)).toThrow(
        /must end with "_test"/,
      );
    },
  );

  it('does not put the password in the error message', () => {
    let message = '';
    try {
      assertIsTestDatabase('postgresql://u:s3cret-pass@localhost:5432/salary_dev');
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toBe('');
    expect(message).not.toContain('s3cret-pass');
  });
});
