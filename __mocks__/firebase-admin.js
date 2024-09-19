// __mocks__/firebase-admin.js
const mockRef = jest.fn(() => mockRef);
mockRef.set = jest.fn(() => Promise.resolve());
mockRef.once = jest.fn(() => Promise.resolve({
  val: () => ({ /* Mocked return value */ })
}));
mockRef.remove = jest.fn(() => Promise.resolve());

const database = jest.fn(() => ({ ref: mockRef }));

module.exports = {
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn()
  },
  database
};

