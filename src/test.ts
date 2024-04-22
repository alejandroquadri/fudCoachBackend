import { UserController } from './controllers';

async function testHashtest() {
  const userController = new UserController();
  const password = 'vamoscuba';
  const result = await userController.hashtest(password);
  console.log('Password test result:', result); // This should log `true` if everything is correct
}

async function testHashtest2() {
  const userController = new UserController();
  const password = 'vamoscuba';
  const hash = '$2a$08$H8nsbzEg/RlwD89lEM0vMek9JR3RgE0WexdW2rA8SGA5NxQLeGXfq';
  const result = await userController.hashtest2(password, hash);
  console.log('Password test result:', result); // This should log `true` if everything is correct
}

testHashtest().catch(console.error);
testHashtest2().catch(console.error);

// para probar estas funciones en la terminal desde ./src `npx ts-node ./testHashtest.ts`
